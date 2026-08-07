import { basename, dirname } from "node:path";
import { TIER_THRESHOLD, type DayBucket, type TieredTokens } from "./buckets";
import { priceBucket, type PriceTable } from "./price-table";

// ─── What this is ──────────────────────────────────────────────────────────────
//
// The COST-SPECIFIC half of the usage pipeline. The generic incremental
// file-index mechanics (enumerate → fingerprint-diff → bounded parse → atomic
// persist → drop-vanished) live in `@plugins/infra/plugins/corpus-index`;
// `load-usage.ts` drives a `defineCorpusIndex` instance keyed on `FilePartial`
// with `parseTranscript` as the per-file parse. This file owns only:
//
//   • `parseTranscript` — the token parse of one JSONL transcript (pricing-free);
//   • `rollup`          — the pure in-memory rollup of the per-file partials into
//                         daily/session bundles, priced EXACTLY per bucket from
//                         the price table.
//
// Pricing is not stored here and never baked into a partial: a bucket carries
// the tier-decomposed token counts (`buckets.ts`) and `rollup` turns them into
// dollars with today's table, so the archive stays re-priceable forever.
//
// Bump `INDEX_VERSION` whenever `FilePartial`'s shape changes: the corpus index
// treats a version mismatch as empty and rebuilds.
export const INDEX_VERSION = 3;

export type { DayBucket } from "./buckets";

/**
 * The per-file token aggregate for one session file. Pricing-free by design:
 * cost is derived at rollup from the price table, never stored per file. This is
 * the corpus index's `TPartial`, and the unit the permanent archive persists.
 *
 * The scalar totals are redundant with `dayBuckets` but kept deliberately —
 * `handleTokenMix` and the session rows read them directly, and recomputing them
 * from the buckets on every read would cost more than the five numbers.
 * `cacheCreationTokens` is 5m + 1h combined.
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

/** A model the price table could not resolve, with the tokens it left unpriced. */
export interface UnpricedModel {
  model: string;
  tokens: number;
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
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
      speed?: string | null;
    };
  };
}

/**
 * ccusage's `createUniqueHash` (`data-loader-9ESMosno.js:5570-5575`), inlined
 * verbatim so the serving path no longer imports `ccusage` at runtime (it stays
 * a dev-only dep for the verification script). `null` means "not dedupable" —
 * an entry missing either id is counted, exactly as ccusage does.
 */
function createUniqueHash(entry: RawEntry): string | null {
  const messageId = entry.message?.id;
  const requestId = entry.requestId;
  if (messageId == null || requestId == null) return null;
  return `${messageId}:${requestId}`;
}

/** `{below: min(t, 200k), above: max(0, t − 200k)}` accumulated into `acc`. */
function addTiered(acc: TieredTokens, t: number): void {
  acc.below += Math.min(t, TIER_THRESHOLD);
  acc.above += Math.max(0, t - TIER_THRESHOLD);
}

function emptyTiered(): TieredTokens {
  return { below: 0, above: 0 };
}

/**
 * `usage.speed` → the closed `DayBucket.speed` dimension. 28% of sampled entries
 * predate the field (absent/`null`), the rest are `"standard"`; none are
 * `"fast"` yet, so that arm is defensive rather than observed.
 *
 * An unrecognized value normalizes to `"standard"`: the union is closed by
 * `DayBucket`, and a genuinely new speed tier is a schema change (new arm +
 * `INDEX_VERSION` bump + a rate in `ModelPrice`), not something this parse can
 * represent.
 */
function normalizeSpeed(speed: string | null | undefined): "standard" | "fast" {
  return speed === "fast" ? "fast" : "standard";
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
  // Per (date, model, speed) token buckets, keyed `${date} ${model} ${speed}`.
  const buckets = new Map<string, DayBucket>();
  // Within-file dedup by ccusage's entry hash, matching its counting. Rare
  // cross-file duplicates are NOT deduped — persisting every hash would bloat
  // the index by hundreds of MB. Measured divergence: +$56.52 on $13,980.67
  // (+0.404%), i.e. we over-count. This gap GROWS with `--fork-session`, because
  // a fork copies the parent transcript into a new file, so every fork
  // double-counts the parent's whole history.
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

    const hash = createUniqueHash(obj);
    if (hash != null) {
      if (seen.has(hash)) continue; // duplicate record — skip (ccusage parity)
      seen.add(hash);
    }

    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    // Cache creation splits by TTL, priced ~1.6× apart. `cache_creation` is
    // present on current transcripts and its two members sum exactly to
    // `cache_creation_input_tokens`; older entries predate the object, so all of
    // the scalar is attributed to 5m (the only rate that existed then).
    const create = usage.cache_creation;
    const cacheCreate5m = create
      ? (create.ephemeral_5m_input_tokens ?? 0)
      : (usage.cache_creation_input_tokens ?? 0);
    const cacheCreate1h = create ? (create.ephemeral_1h_input_tokens ?? 0) : 0;
    const cacheCreation = cacheCreate5m + cacheCreate1h;

    inputTokens += input;
    outputTokens += output;
    cacheCreationTokens += cacheCreation;
    cacheReadTokens += cacheRead;

    const day = typeof obj.timestamp === "string" ? obj.timestamp.slice(0, 10) : "";
    if (day && day > lastActivity) lastActivity = day;
    const model = obj.message?.model;
    if (model) models.add(model);

    if (day && model) {
      const speed = normalizeSpeed(usage.speed);
      const key = `${day} ${model} ${speed}`;
      const b = buckets.get(key) ?? {
        date: day,
        model,
        speed,
        input: emptyTiered(),
        output: emptyTiered(),
        cacheRead: emptyTiered(),
        cacheCreate5m: emptyTiered(),
        cacheCreate1h: emptyTiered(),
      };
      // PER ENTRY, before aggregating — that is the whole point of the
      // decomposition (see `buckets.ts`). Aggregating first and tiering after
      // would charge the >200k rate to entries that never crossed it.
      addTiered(b.input, input);
      addTiered(b.output, output);
      addTiered(b.cacheRead, cacheRead);
      // The 200k tier is defined on the entry's COMBINED cache-creation count
      // (ccusage sees one `cache_creation_input_tokens` number), so the split
      // point is computed on the total and then apportioned across 5m/1h by
      // their share of it. Keeps the decomposition linear, and conserves exactly
      // (the 1h side takes the remainder rather than its own rounded product).
      // A deliberate divergence from ccusage, which ignores 1h entirely.
      const below = Math.min(cacheCreation, TIER_THRESHOLD);
      const above = Math.max(0, cacheCreation - TIER_THRESHOLD);
      const below5m = cacheCreation > 0 ? (below * cacheCreate5m) / cacheCreation : 0;
      const above5m = cacheCreation > 0 ? (above * cacheCreate5m) / cacheCreation : 0;
      b.cacheCreate5m.below += below5m;
      b.cacheCreate5m.above += above5m;
      b.cacheCreate1h.below += below - below5m;
      b.cacheCreate1h.above += above - above5m;
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

function tieredTotal(t: TieredTokens): number {
  return t.below + t.above;
}

/**
 * Roll the per-file partials (keyed by path — `corpusIndex.entries()`, merged
 * with the archive) up into daily/session bundles.
 *
 * Cost is EXACT everywhere: each `(date, model, speed)` bucket is priced on its
 * own by `priceBucket`, and a session total, a daily total and a model
 * breakdown are all plain sums of bucket costs. There is no token-share
 * approximation left anywhere in this pipeline — the previous scheme took
 * ccusage's per-PROJECT total and divided it across the project's files by token
 * count, which could not survive an archive whose files ccusage never sees.
 *
 * Buckets whose model the table cannot resolve contribute `$0` **and** an entry
 * in `unpriced` (deduped by model, tokens summed). The caller decides what that
 * means — this function neither throws nor pretends the bucket was free.
 */
export function rollup(
  entries: Map<string, FilePartial>,
  table: PriceTable,
): {
  daily: DailyRow[];
  sessions: SessionRollup[];
  unpriced: UnpricedModel[];
} {
  const sessions: SessionRollup[] = [];
  // Daily rows keyed `${date} ${projectDir}`.
  const dailyMap = new Map<string, DailyRow & { _models: Map<string, number> }>();
  const unpricedMap = new Map<string, number>();

  // Stable order for deterministic output.
  const sorted = [...entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  for (const [, p] of sorted) {
    let sessionCost = 0;

    for (const b of p.dayBuckets) {
      const priced = priceBucket(b, table);
      let cost: number;
      if (priced.ok) {
        cost = priced.cost;
      } else {
        cost = 0;
        unpricedMap.set(priced.model, (unpricedMap.get(priced.model) ?? 0) + priced.tokens);
      }
      sessionCost += cost;

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
      row.inputTokens += tieredTotal(b.input);
      row.outputTokens += tieredTotal(b.output);
      row.cacheCreationTokens += tieredTotal(b.cacheCreate5m) + tieredTotal(b.cacheCreate1h);
      row.cacheReadTokens += tieredTotal(b.cacheRead);
      row._models.set(b.model, (row._models.get(b.model) ?? 0) + cost);
      row.totalCost += cost;
    }

    sessions.push({
      sessionId: p.sessionId,
      projectDir: p.projectDir,
      totalTokens: p.totalTokens,
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      cacheCreationTokens: p.cacheCreationTokens,
      cacheReadTokens: p.cacheReadTokens,
      cost: sessionCost,
      lastActivity: p.lastActivity,
      modelsUsed: p.modelsUsed,
    });
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
  const unpriced = [...unpricedMap.entries()].map(([model, tokens]) => ({ model, tokens }));
  return { daily, sessions, unpriced };
}
