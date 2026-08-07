import { join } from "node:path";
import { isNotNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import {
  CLAUDE_PROJECTS_DIR,
  COST_USAGE_DIR,
  isHostSingleton,
} from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { defineCorpusIndex } from "@plugins/infra/plugins/corpus-index/server";
import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import { idForCliName } from "@plugins/conversations/plugins/model-provider/core";
import {
  flushArchive,
  loadArchive,
  mergeLive,
  type ArchiveConvMeta,
  type ArchiveEntry,
  type ArchiveShrink,
} from "./archive";
import { isSingularityProjectDir } from "./classify-projects";
import { loadFallbackPriceTable } from "./litellm-fallback";
import {
  fetchPriceTable,
  loadPriceTable,
  mergePriceTable,
  savePriceTable,
  type PriceTable,
} from "./price-table";
import { reportCostAnomalies } from "./record-anomalies";
import {
  INDEX_VERSION,
  parseTranscript,
  rollup,
  type DailyRow,
  type FilePartial,
  type SessionRollup,
  type UnpricedModel,
} from "./usage-index";

export type { DailyRow } from "./usage-index";

export type Scope = "all" | "singularity";

/**
 * The conversation metadata a session row renders with. Every field is nullable
 * because an ARCHIVED session may have no surviving `_conversations` row at all
 * (rows live in the per-worktree DB fork and are deleted with their task) — its
 * title/conversationId then come from the archive snapshot, and its status is
 * genuinely unknown rather than defaulted to something that looks live.
 */
export interface ConvMeta {
  conversationId: string | null;
  title: string | null;
  status: string | null;
}

// Per-conversation token totals (one per JSONL file). `cost` is the exact sum of
// this session's own priced (date, model, speed) buckets — see usage-index
// rollup.
export interface PerSession {
  sessionId: string;
  projectDir: string;
  isSingularity: boolean;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  lastActivity: string;
  modelsUsed: string[];
}

interface AggregateBundle {
  daily: DailyRow[];
  sessions: PerSession[];
  // Encoded project dir → isSingularity?
  projectIsSingularity: Map<string, boolean>;
  convBySession: Map<string, ConvMeta>;
}

/**
 * `buildBundle`'s full result: the read-path bundle PLUS the two things only the
 * capture path (warm-up, daily job) consumes — the merged archive to flush and
 * the anomalies to report. Kept off `AggregateBundle` so a request handler cannot
 * accidentally reach for a durable-write payload.
 */
interface BundleBuild {
  bundle: AggregateBundle;
  merged: Map<string, ArchiveEntry>;
  unpriced: UnpricedModel[];
  shrunk: ArchiveShrink[];
}

const INDEX_PATH = join(COST_USAGE_DIR, "index.json");
const PRICE_TABLE_PATH = join(COST_USAGE_DIR, "price-table.json");

// The incremental host-global transcript index — the generic mechanics
// (enumerate → (mtime,size) fingerprint diff → bounded parse → atomic persist →
// drop-vanished) live in `infra/corpus-index`; this instance supplies the
// cost-specific `parseTranscript`. Only main persists the shared index; worktree
// backends read it and compute any delta in-memory (scope: "host"). Every
// loadBundle calls `ensureFresh()` — the lazy on-read stat-diff correctness
// fallback that makes the deferred warmup safe.
//
// This index is the LIVE corpus only: `refreshCorpus` drops paths that vanished
// from disk, which is precisely why the permanent archive (`archive.ts`) exists
// and why every read merges the two.
const costIndex = defineCorpusIndex<FilePartial>({
  name: "stats.cost.usage",
  roots: [CLAUDE_PROJECTS_DIR],
  match: (p) => p.endsWith(".jsonl"),
  parse: parseTranscript,
  indexPath: INDEX_PATH,
  scope: "host",
  version: INDEX_VERSION,
  concurrency: 6,
});

// The price table, read from disk once per process and merged/refreshed by the
// daily job. The vendored LiteLLM snapshot is the floor for a machine that has
// never fetched (first boot, offline) — never a silent empty table, which would
// price the whole corpus as unknown-model.
let priceTable: PriceTable | null = null;
let priceTableInflight: Promise<PriceTable> | null = null;

async function ensurePriceTable(): Promise<PriceTable> {
  if (priceTable) return priceTable;
  priceTableInflight ??= (async () => {
    try {
      const loaded = await loadPriceTable(PRICE_TABLE_PATH);
      priceTable = loaded ?? (await loadFallbackPriceTable());
      return priceTable;
    } finally {
      priceTableInflight = null;
    }
  })();
  return priceTableInflight;
}

/**
 * Fetch LiteLLM's live table, merge it into what we already hold, persist, and
 * adopt it in-process. Driven by the daily refresh job.
 *
 * The merge NEVER deletes a key (see `mergePriceTable`), so a model BerriAI has
 * since pruned keeps the price we learned while it existed — the archive spans
 * years and would otherwise silently reprice that history as unknown-model.
 */
export async function refreshPriceTable(): Promise<{ models: number }> {
  const [existing, fetched] = await Promise.all([ensurePriceTable(), fetchPriceTable()]);
  const next = mergePriceTable(existing, fetched);
  await savePriceTable(PRICE_TABLE_PATH, next);
  priceTable = next;
  return { models: Object.keys(next.models).length };
}

// The permanent archive, read from disk ONCE per process. `buildBundle` folds the
// live corpus into it on every read (pure) and adopts the result, so a transcript
// that Claude Code deletes mid-process stays banked in memory until the next
// flush instead of being lost between the boot load and the daily write.
let archive: Map<string, ArchiveEntry> | null = null;
let archiveInflight: Promise<Map<string, ArchiveEntry>> | null = null;

async function ensureArchive(): Promise<Map<string, ArchiveEntry>> {
  if (archive) return archive;
  archiveInflight ??= (async () => {
    try {
      archive = await loadArchive(COST_USAGE_DIR);
      return archive;
    } finally {
      archiveInflight = null;
    }
  })();
  return archiveInflight;
}

/**
 * The read path. Pure with respect to disk: it loads, merges and prices, and
 * writes NOTHING — `buildBundle` runs on every cost request, so the archive flush
 * lives in `captureCostHistory` (warm-up + daily job) instead.
 */
async function buildBundle(): Promise<BundleBuild> {
  await costIndex.ensureFresh();
  const [table, banked, mainRoot, conv] = await Promise.all([
    ensurePriceTable(),
    ensureArchive(),
    ensureMainWorktreeRoot(),
    loadConvMeta(),
  ]);
  const repoBasename = mainRoot.split("/").pop() ?? "";

  const { merged, shrunk } = mergeLive(
    banked,
    costIndex.entries(),
    conv.forArchive,
    repoBasename,
  );
  // Adopt the merge: the in-memory archive is monotonic for the life of the
  // process, so a file deleted after boot is still flushed by the daily job.
  archive = merged;

  // Everything downstream reads the MERGED set — live ∪ archived. Rolling up
  // `costIndex.entries()` here would price only the transcripts that still exist
  // on disk, i.e. exactly the retroactive truncation the archive exists to end.
  const partials = new Map<string, FilePartial>();
  for (const [path, entry] of merged) partials.set(path, entry.partial);
  const { daily, sessions, unpriced } = rollup(partials, table);

  const projectIsSingularity = classifyProjects(merged.values(), repoBasename);
  const decorated = sessions.map(
    (s: SessionRollup): PerSession => ({
      ...s,
      isSingularity: projectIsSingularity.get(s.projectDir) ?? false,
    }),
  );
  return {
    bundle: {
      daily,
      sessions: decorated,
      projectIsSingularity,
      convBySession: withArchivedMeta(conv.display, merged),
    },
    merged,
    unpriced,
    shrunk,
  };
}

export async function loadBundle(): Promise<AggregateBundle> {
  return (await buildBundle()).bundle;
}

/**
 * Bank the current merged state to disk and surface the anomalies the merge and
 * the pricing pass found.
 *
 * Called from exactly two places — the boot warm-up and the daily refresh job —
 * because it WRITES. Transcripts only vanish after 30 untouched days, so a daily
 * flush plus one at boot leaves a ~30× margin; flushing per request would put a
 * whole-shard `JSON.stringify` on the serving path.
 *
 * `isHostSingleton()`, never `isMain()`: in a compiled release the single backend
 * runs under the composition name, so an `isMain()` gate here would silently mean
 * the archive is never written there — invisible, because there is no second
 * backend to notice.
 *
 * That gate is correct but not yet sufficient: BOTH callers are still reached
 * through upstream `isMain()` gates (the warmup executor skips `scope: "host"`,
 * graphile's cron builder skips non-`perWorktree` schedules), so today the
 * archive is written in dev only. See the deferred note on `costRefreshJob`.
 */
export async function captureCostHistory(): Promise<void> {
  const { merged, unpriced, shrunk } = await buildBundle();
  await reportCostAnomalies(unpriced, shrunk);
  if (!isHostSingleton()) return;
  await flushArchive(COST_USAGE_DIR, merged);
}

// Declared heavy boot warm-up (replacing the former raw `onReady` prewarm): warm
// the host-global usage index and start the corpus watcher on MAIN
// ONLY (`scope: "host"`), DEFERRED past serving-ready and THROTTLED by the
// warmup executor instead of competing with first requests on `onReady`. The
// index is shared across worktrees, so a single writer keeps it fresh and no
// worktree backend pays the parse. A request arriving before the drain still
// serves correctly via the on-demand `ensureFresh()` fallback in `loadBundle`.
export const costUsageWarmup = defineWarmup({
  name: "stats.cost.usage",
  scope: "host",
  run: warmAndWatch,
});

async function warmAndWatch(): Promise<void> {
  // Watcher first so no corpus change is missed between warm and watch-start.
  await costIndex.startWatcher();
  // Warms the same path a request takes AND banks it — one of the archive's two
  // write points (the other is the daily job), so a dev machine whose backend
  // restarts often still captures history even if the cron tick is missed.
  // Both paths are `isMain()`-gated upstream — see the note on `costRefreshJob`.
  await captureCostHistory();
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * The live `_conversations` join, in the two shapes its two consumers need:
 * `display` for the session rows (carries `status`), `forArchive` for the archive
 * snapshot (title + id only — the archive is not a mirror of live state).
 */
async function loadConvMeta(): Promise<{
  display: Map<string, ConvMeta>;
  forArchive: Map<string, ArchiveConvMeta>;
}> {
  const rows = await db
    .select({
      id: _conversations.id,
      title: _conversations.title,
      status: _conversations.status,
      claudeSessionId: _conversations.claudeSessionId,
    })
    .from(_conversations)
    .where(isNotNull(_conversations.claudeSessionId));
  const display = new Map<string, ConvMeta>();
  const forArchive = new Map<string, ArchiveConvMeta>();
  for (const r of rows) {
    if (!r.claudeSessionId) continue;
    display.set(r.claudeSessionId, {
      conversationId: r.id,
      title: r.title,
      status: r.status,
    });
    forArchive.set(r.claudeSessionId, { conversationId: r.id, title: r.title });
  }
  return { display, forArchive };
}

/**
 * The live DB join, backfilled from the archive's snapshotted titles.
 *
 * Conversation rows are deleted with their task, so a purely live join renders
 * every archived session as a bare UUID with no link. The live row still WINS
 * where it exists (it is current); the snapshot only fills a gap — a missing row,
 * or a surviving row whose title was never set.
 */
function withArchivedMeta(
  display: Map<string, ConvMeta>,
  merged: Map<string, ArchiveEntry>,
): Map<string, ConvMeta> {
  const out = new Map(display);
  for (const entry of merged.values()) {
    const sessionId = entry.partial.sessionId;
    const live = out.get(sessionId);
    if (live) {
      if (live.title === null && entry.title !== null) {
        out.set(sessionId, { ...live, title: entry.title });
      }
      continue;
    }
    if (entry.title === null && entry.conversationId === null) continue;
    out.set(sessionId, {
      conversationId: entry.conversationId,
      title: entry.title,
      status: null,
    });
  }
  return out;
}

// Classify every project dir the MERGED set knows about as Singularity-related
// or not, by matching the encoded dir name against the main repo basename (see
// `isSingularityProjectDir` for the encoding and why the user prefix is ignored).
//
// Two things this must not be:
//
//   • a `readdir` of `~/.claude/projects` — a dir absent from the listing
//     resolved to `false` through the callers' `?? false`, and since the default
//     scope is `"singularity"`, that silently hid a project's sessions from every
//     chart as soon as its directory left disk;
//   • live-only — the membership set is the merged partials, so an archived
//     project whose directory Claude Code has since deleted still classifies.
//
// The stored `isSingularity` is the OR-fallback: `repoBasename` comes from the
// current main worktree root, so renaming or relocating the repo would otherwise
// reclassify all archived history as non-Singularity in one shot.
function classifyProjects(
  entries: Iterable<ArchiveEntry>,
  repoBasename: string,
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const e of entries) {
    const dir = e.partial.projectDir;
    const live = repoBasename !== "" && isSingularityProjectDir(dir, repoBasename);
    out.set(dir, (out.get(dir) ?? false) || live || e.isSingularity);
  }
  return out;
}

// CLI model name (e.g. "opus-4-7-20250101") → registry id "opus-4-7"; falls back to the original name for historical/unknown models.
export function canonicalModel(name: string): string {
  return idForCliName(name) ?? name;
}
