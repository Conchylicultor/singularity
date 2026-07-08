import { readdir, readFile, rename, stat, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createUniqueHash } from "ccusage/data-loader";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { withHeavyReadSlot } from "@plugins/infra/plugins/host-read-pool/server";

// ─── Index schema ────────────────────────────────────────────────────────────
//
// The index is a host-global, incremental per-file cache of the
// `~/.claude/projects` transcript corpus. Each JSONL file is parsed for TOKENS
// exactly once (keyed on its `(mtime, size)` fingerprint); immutable historical
// files are never re-parsed.
//
// Dollar cost is DECOUPLED from the token parse. Token refresh is cheap and runs
// on every corpus change; pricing is a coarse per-project map refreshed at most
// once per TTL via an off-loop subprocess (see `ensurePriced`). A file's cost is
// derived at rollup from that map + its live token count, so a growing session's
// cost tracks without any per-file re-pricing on the event loop.
//
// Bump `INDEX_VERSION` whenever the persisted shape changes: a version mismatch
// (or any parse failure) is treated as an empty index and rebuilt.
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
 * cost is derived at rollup from the index's price map, never stored per file.
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

interface IndexEntry {
  mtimeMs: number;
  size: number;
  partial: FilePartial;
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

export interface UsageIndex {
  version: number;
  files: Record<string, IndexEntry>;
  pricing?: PricingSnapshot;
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

// ─── Dependencies (injectable for tests) ─────────────────────────────────────

export interface IndexDeps {
  /** Root holding `<projectDir>/<sessionId>.jsonl` files (defaults to CLAUDE_PROJECTS_DIR). */
  projectsRoot: string;
  /** On-disk `index.json` path. */
  indexPath: string;
  /** Pricing source (ccusage subprocess in prod, a stub in tests). */
  costSource: CostSource;
  /** Persist the index to disk after a change (main-only in prod). */
  persist: boolean;
}

// Bounded parse concurrency: caps resident memory to ~K files' text at once
// (killing the unbounded-Promise.all spike) while still admitting each read
// through the host-wide heavy-read gate.
const PARSE_CONCURRENCY = 6;

// ─── Load / save (atomic) ────────────────────────────────────────────────────

export async function loadIndex(indexPath: string): Promise<UsageIndex> {
  let raw: string;
  try {
    raw = await readFile(indexPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { version: INDEX_VERSION, files: {} };
  }
  let parsed: UsageIndex;
  try {
    parsed = JSON.parse(raw) as UsageIndex;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return { version: INDEX_VERSION, files: {} };
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard on untrusted on-disk JSON
  if (!parsed || parsed.version !== INDEX_VERSION || typeof parsed.files !== "object") {
    return { version: INDEX_VERSION, files: {} };
  }
  return parsed;
}

async function saveIndex(indexPath: string, index: UsageIndex): Promise<void> {
  await mkdir(dirname(indexPath), { recursive: true });
  // Atomic write: a partially-written index would fail the version/shape guard
  // and force a full rebuild, so write to a sibling temp file then rename.
  const tmp = `${indexPath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(index), "utf8");
  await rename(tmp, indexPath);
}

// ─── Refresh (incremental, TOKENS ONLY) ──────────────────────────────────────

interface FileRef {
  path: string;
  projectDir: string;
  sessionId: string;
}

async function enumerateFiles(projectsRoot: string): Promise<FileRef[]> {
  let dirents;
  try {
    dirents = await readdir(projectsRoot, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }
  const out: FileRef[] = [];
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const projectDir = d.name;
    let files: string[];
    try {
      files = await readdir(join(projectsRoot, projectDir));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      out.push({
        path: join(projectsRoot, projectDir, f),
        projectDir,
        sessionId: basename(f, ".jsonl"),
      });
    }
  }
  return out;
}

/**
 * Incremental TOKEN refresh: stat every file, re-parse only those whose
 * `(mtime,size)` fingerprint changed, drop entries for files that vanished.
 * Pricing-free — cost never touches this (event-loop) path. Mutates `index` in
 * place; persists (once) if a change occurred and `deps.persist` is set.
 */
export async function refreshIndex(
  index: UsageIndex,
  deps: IndexDeps,
): Promise<{ changed: boolean }> {
  const refs = await enumerateFiles(deps.projectsRoot);
  const live = new Set(refs.map((r) => r.path));
  let changed = false;

  // Drop entries for files that no longer exist.
  for (const path of Object.keys(index.files)) {
    if (!live.has(path)) {
      delete index.files[path];
      changed = true;
    }
  }

  // Stat all files; collect the ones whose fingerprint changed (or are new).
  const toParse: Array<{ ref: FileRef; mtimeMs: number; size: number }> = [];
  const statGate = createSemaphore(PARSE_CONCURRENCY);
  await Promise.all(
    refs.map((ref) =>
      statGate.run(async () => {
        let st;
        try {
          st = await stat(ref.path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          return;
        }
        const cached = index.files[ref.path];
        if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
          return; // unchanged historical file — skip
        }
        toParse.push({ ref, mtimeMs: st.mtimeMs, size: st.size });
      }),
    ),
  );

  // Parse changed/new files through the bounded, heavy-read-gated pipeline.
  const parseGate = createSemaphore(PARSE_CONCURRENCY);
  await Promise.all(
    toParse.map((item) =>
      parseGate.run(async () => {
        const partial = await withHeavyReadSlot(() => parseFile(item.ref));
        index.files[item.ref.path] = {
          mtimeMs: item.mtimeMs,
          size: item.size,
          partial,
        };
        changed = true;
        // Yield so request serving interleaves between files.
        await Promise.resolve();
      }),
    ),
  );

  if (changed && deps.persist) {
    await saveIndex(deps.indexPath, index);
  }
  return { changed };
}

// ─── Pricing (throttled, off-loop) ───────────────────────────────────────────

/**
 * Refresh the cached per-project price map if it is missing or older than
 * `ttlMs`. The heavy ccusage parse runs off the event loop (subprocess) inside
 * `costSource.bulkProjectCosts`, so this awaits without blocking serving. Lazy
 * on-serve staleness — NOT a polling timer. Persists (main-only) when refreshed.
 */
export async function ensurePriced(
  index: UsageIndex,
  deps: IndexDeps,
  opts: { ttlMs: number; now?: number },
): Promise<{ priced: boolean }> {
  const now = opts.now ?? Date.now();
  if (index.pricing && now - index.pricing.pricedAt <= opts.ttlMs) {
    return { priced: false };
  }
  try {
    const map = await deps.costSource.bulkProjectCosts();
    // Store only real (>0) prices; omit projects ccusage couldn't price so
    // rollup yields 0 for them and the next pass retries — never cache a wrong
    // $0.
    const projectCosts = [...map.entries()].filter(([, c]) => c > 0);
    index.pricing = { pricedAt: now, projectCosts };
    if (deps.persist) {
      await saveIndex(deps.indexPath, index);
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
    index.pricing = { pricedAt: now, projectCosts: index.pricing?.projectCosts ?? [] };
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

async function parseFile(ref: FileRef): Promise<FilePartial> {
  const text = await Bun.file(ref.path).text().catch(() => "");
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
    sessionId: ref.sessionId,
    projectDir: ref.projectDir,
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

export function rollup(index: UsageIndex): {
  daily: DailyRow[];
  sessions: SessionRollup[];
} {
  // Cached per-project exact totals; a file's cost is its project total
  // distributed by token share (daily/total exact, within-project split
  // proportional). A project absent from the map (unpriced/$0) → 0 cost.
  const priceMap = new Map(index.pricing?.projectCosts ?? []);
  const projectTokens = new Map<string, number>();
  for (const e of Object.values(index.files)) {
    projectTokens.set(
      e.partial.projectDir,
      (projectTokens.get(e.partial.projectDir) ?? 0) + e.partial.totalTokens,
    );
  }

  const sessions: SessionRollup[] = [];
  // Daily rows keyed `${date} ${projectDir}`.
  const dailyMap = new Map<
    string,
    DailyRow & { _models: Map<string, number> }
  >();

  // Stable order for deterministic output.
  const entries = Object.entries(index.files).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  for (const [, e] of entries) {
    const p = e.partial;
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
