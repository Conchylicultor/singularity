import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { createUniqueHash } from "ccusage/data-loader";

// ─── What this is ──────────────────────────────────────────────────────────────
//
// The COST-SPECIFIC half of the usage pipeline. The generic incremental
// file-index mechanics (enumerate → fingerprint-diff → bounded parse → atomic
// persist → drop-vanished) now live in `@plugins/infra/plugins/corpus-index`;
// `load-usage.ts` drives a `defineCorpusIndex` instance keyed on `FilePartial`
// with `parseTranscript` as the per-file parse. This file owns only:
//
//   • `parseTranscript` — the token parse of one JSONL transcript (pricing-free);
//   • `rollup`          — the pure in-memory rollup of the per-file partials into
//                         daily/session bundles, priced from the throttled map;
//   • `ensurePriced`    — the throttled, off-loop ccusage dollar-pricing pass and
//                         its own persistence (a sibling `pricing.json`, decoupled
//                         from the corpus index file so each has a single writer).
//
// Bump `INDEX_VERSION` whenever `FilePartial`'s shape changes: the corpus index
// treats a version mismatch as empty and rebuilds.
export const INDEX_VERSION = 2;

/** This file's contribution to one `(date × model)` token bucket. */
export interface DayBucket {
  date: string; // YYYY-MM-DD
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/**
 * The per-file token aggregate for one session file. Pricing-free by design:
 * cost is derived at rollup from the price map, never stored per file. This is
 * the corpus index's `TPartial`.
 */
export interface FilePartial {
  sessionId: string;
  projectDir: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  lastActivity: string; // YYYY-MM-DD (latest entry day)
  modelsUsed: string[];
  dayBuckets: DayBucket[];
}

/**
 * Cached, throttled pricing: exact per-project dollar totals from ccusage
 * (online), refreshed at most once per TTL. `pricedAt` is a wall-clock ms stamp.
 * Only projects with a real (>0) price are stored — a project ccusage could not
 * price ($0 with tokens) is omitted so rollup yields 0 and the next pass retries,
 * never caching a wrong $0.
 */
export interface PricingSnapshot {
  pricedAt: number;
  projectCosts: [string, number][];
}

// ─── Rollup output ───────────────────────────────────────────────────────────

/**
 * One `(date, project)` daily row — the local replacement for ccusage's
 * `DailyUsage`, carrying exactly the fields the handlers read.
 */
export interface DailyRow {
  date: string;
  project: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelBreakdowns: { modelName: string; cost: number }[];
  totalCost: number;
}

/** Per-session rollup (one per file); `isSingularity` is added by the caller. */
export interface SessionRollup {
  sessionId: string;
  projectDir: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  lastActivity: string;
  modelsUsed: string[];
}

// ─── Cost source (ccusage, online, off-loop) ─────────────────────────────────
//
// The ONLY pricing path. Kept behind this one-method interface so the token
// parse stays pricing-free and unit-testable without network, and the ccusage
// dependency is a single seam. The real implementation runs ccusage's unbounded
// whole-corpus parse in a subprocess (off the event loop); tests inject a
// deterministic stub.
export interface CostSource {
  /**
   * One pass over the whole corpus → exact cost keyed by **project dir**.
   * ccusage groups the (2-level `projects/<dir>/<id>.jsonl`) layout by project
   * directory, so this is a per-project total. Distributed to files by token
   * share at rollup.
   */
  bulkProjectCosts(): Promise<Map<string, number>>;
}

// ─── Pricing (throttled, off-loop) ───────────────────────────────────────────

/** Mutable holder for the cached price snapshot (owned by `load-usage.ts`). */
export interface PricingHolder {
  pricing?: PricingSnapshot;
}

export interface PricingDeps {
  /** Pricing source (ccusage subprocess in prod, a stub in tests). */
  costSource: CostSource;
  /** Persist the snapshot to disk after a refresh (main-only in prod). */
  persist: boolean;
  /** On-disk `pricing.json` path (a sibling of the corpus index file). */
  pricingPath: string;
}

export async function loadPricing(pricingPath: string): Promise<PricingSnapshot | undefined> {
  let raw: string;
  try {
    raw = await readFile(pricingPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return undefined;
  }
  let parsed: PricingSnapshot;
  try {
    parsed = JSON.parse(raw) as PricingSnapshot;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return undefined;
  }
  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard on untrusted on-disk JSON
    !parsed ||
    typeof parsed.pricedAt !== "number" ||
    !Array.isArray(parsed.projectCosts)
  ) {
    return undefined;
  }
  return parsed;
}

async function savePricing(pricingPath: string, snapshot: PricingSnapshot): Promise<void> {
  await mkdir(dirname(pricingPath), { recursive: true });
  // Atomic write (temp + rename) — a partial write would fail the shape guard
  // in loadPricing and be treated as absent.
  const tmp = `${pricingPath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot), "utf8");
  await rename(tmp, pricingPath);
}

/**
 * Refresh the cached per-project price map if it is missing or older than
 * `ttlMs`. The heavy ccusage parse runs off the event loop (subprocess) inside
 * `costSource.bulkProjectCosts`, so this awaits without blocking serving. Lazy
 * on-serve staleness — NOT a polling timer. Persists (main-only) when refreshed.
 */
export async function ensurePriced(
  holder: PricingHolder,
  deps: PricingDeps,
  opts: { ttlMs: number; now?: number },
): Promise<{ priced: boolean }> {
  const now = opts.now ?? Date.now();
  if (holder.pricing && now - holder.pricing.pricedAt <= opts.ttlMs) {
    return { priced: false };
  }
  try {
    const map = await deps.costSource.bulkProjectCosts();
    // Store only real (>0) prices; omit projects ccusage couldn't price so
    // rollup yields 0 for them and the next pass retries — never cache a wrong
    // $0.
    const projectCosts = [...map.entries()].filter(([, c]) => c > 0);
    holder.pricing = { pricedAt: now, projectCosts };
    if (deps.persist) {
      await savePricing(deps.pricingPath, holder.pricing);
    }
    return { priced: true };
  } catch (err) {
    // Stamp the ATTEMPT (not just successes) so a failing pass — e.g. ccusage
    // hitting a vanished file during heavy worktree churn — cannot re-spawn the
    // subprocess on the very next request. This preserves the "at most one
    // pricing subprocess per TTL" invariant even under sustained failure. Keep
    // the last successful prices so rollup serves stale rather than 0, and do
    // NOT persist (a restart re-attempts fresh). Still rethrow — the failure
    // surfaces loudly, just once per TTL window instead of on every request.
    holder.pricing = { pricedAt: now, projectCosts: holder.pricing?.projectCosts ?? [] };
    throw err;
  }
}

// ─── Parse one file (tokens only, pricing-free) ──────────────────────────────

interface RawEntry {
  timestamp?: string;
  requestId?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

/**
 * The corpus index's per-file `parse`. Token-only, pricing-free, side-effect
 * free. `projectDir`/`sessionId` are derived from the (2-level
 * `<projectDir>/<sessionId>.jsonl`) path so the parse needs only the full path.
 */
export async function parseTranscript(path: string): Promise<FilePartial> {
  const sessionId = basename(path, ".jsonl");
  const projectDir = basename(dirname(path));
  const text = await Bun.file(path).text().catch(() => "");
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let lastActivity = "";
  const models = new Set<string>();
  // Per (date, model) token buckets, keyed `${date} ${model}`.
  const buckets = new Map<string, DayBucket>();
  // Within-file dedup by ccusage's entry hash, matching its counting. (Rare
  // cross-file duplicates are not deduped — persisting every hash would bloat
  // the index by hundreds of MB; the plan accepts this minor divergence.)
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    if (!line) continue;
    let obj: RawEntry;
    try {
      obj = JSON.parse(line) as RawEntry;
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      continue; // tolerate a malformed line
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; parsed JSON may have any shape
    const usage = obj?.message?.usage;
    if (!usage) continue;

    // createUniqueHash only reads `message.id` + `requestId`; our RawEntry
    // carries both. Cast to its parameter type rather than reconstructing a
    // full UsageData.
    const hash = createUniqueHash(obj as Parameters<typeof createUniqueHash>[0]);
    if (hash != null) {
      if (seen.has(hash)) continue; // duplicate record — skip (ccusage parity)
      seen.add(hash);
    }

    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheCreation = usage.cache_creation_input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    inputTokens += input;
    outputTokens += output;
    cacheCreationTokens += cacheCreation;
    cacheReadTokens += cacheRead;

    const day = typeof obj.timestamp === "string" ? obj.timestamp.slice(0, 10) : "";
    if (day && day > lastActivity) lastActivity = day;
    const model = obj.message?.model;
    if (model) models.add(model);

    if (day && model) {
      const key = `${day} ${model}`;
      const b = buckets.get(key) ?? {
        date: day,
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      };
      b.inputTokens += input;
      b.outputTokens += output;
      b.cacheCreationTokens += cacheCreation;
      b.cacheReadTokens += cacheRead;
      buckets.set(key, b);
    }
  }

  return {
    sessionId,
    projectDir,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    lastActivity,
    modelsUsed: [...models],
    dayBuckets: [...buckets.values()],
  };
}

// ─── Rollup (pure, in-memory) ────────────────────────────────────────────────

/**
 * Roll the per-file partials (keyed by path — `corpusIndex.entries()`) up into
 * daily/session bundles, priced from the throttled per-project map. A file's
 * cost is its project total distributed by token share (daily/total exact,
 * within-project split proportional). A project absent from the map
 * (unpriced/$0) → 0 cost.
 */
export function rollup(
  entries: Map<string, FilePartial>,
  pricing: PricingSnapshot | undefined,
): {
  daily: DailyRow[];
  sessions: SessionRollup[];
} {
  const priceMap = new Map(pricing?.projectCosts ?? []);
  const projectTokens = new Map<string, number>();
  for (const p of entries.values()) {
    projectTokens.set(
      p.projectDir,
      (projectTokens.get(p.projectDir) ?? 0) + p.totalTokens,
    );
  }

  const sessions: SessionRollup[] = [];
  // Daily rows keyed `${date} ${projectDir}`.
  const dailyMap = new Map<
    string,
    DailyRow & { _models: Map<string, number> }
  >();

  // Stable order for deterministic output.
  const sorted = [...entries.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  for (const [, p] of sorted) {
    const projTotal = priceMap.get(p.projectDir) ?? 0;
    const projTok = projectTokens.get(p.projectDir) ?? 0;
    const fileCost =
      projTotal > 0 && projTok > 0 ? (projTotal * p.totalTokens) / projTok : 0;

    sessions.push({
      sessionId: p.sessionId,
      projectDir: p.projectDir,
      totalTokens: p.totalTokens,
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      cacheCreationTokens: p.cacheCreationTokens,
      cacheReadTokens: p.cacheReadTokens,
      cost: fileCost,
      lastActivity: p.lastActivity,
      modelsUsed: p.modelsUsed,
    });

    for (const b of p.dayBuckets) {
      const key = `${b.date} ${p.projectDir}`;
      let row = dailyMap.get(key);
      if (!row) {
        row = {
          date: b.date,
          project: p.projectDir,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          modelBreakdowns: [],
          totalCost: 0,
          _models: new Map(),
        };
        dailyMap.set(key, row);
      }
      row.inputTokens += b.inputTokens;
      row.outputTokens += b.outputTokens;
      row.cacheCreationTokens += b.cacheCreationTokens;
      row.cacheReadTokens += b.cacheReadTokens;
      // Distribute this file's cost across its (date,model) token buckets by
      // token share. Exact when a session-day uses one model (the norm).
      const bucketTokens =
        b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens;
      const bucketCost =
        p.totalTokens > 0 ? (fileCost * bucketTokens) / p.totalTokens : 0;
      row._models.set(b.model, (row._models.get(b.model) ?? 0) + bucketCost);
      row.totalCost += bucketCost;
    }
  }

  const daily: DailyRow[] = [];
  for (const row of dailyMap.values()) {
    const { _models, ...rest } = row;
    rest.modelBreakdowns = [..._models.entries()].map(([modelName, cost]) => ({
      modelName,
      cost,
    }));
    daily.push(rest);
  }
  return { daily, sessions };
}
