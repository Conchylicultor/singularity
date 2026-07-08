import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { isNotNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import {
  CLAUDE_PROJECTS_DIR,
  COST_USAGE_DIR,
  isMain,
} from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { createFileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { idForCliName } from "@plugins/conversations/plugins/model-provider/core";
import { ccusageCostSource } from "./ccusage-cost-source";
import {
  ensurePriced,
  loadIndex,
  refreshIndex,
  rollup,
  type DailyRow,
  type IndexDeps,
  type SessionRollup,
  type UsageIndex,
} from "./usage-index";

export type { DailyRow } from "./usage-index";

export type Scope = "all" | "singularity";

export interface ConvMeta {
  conversationId: string;
  title: string | null;
  status: string;
}

// Per-conversation token totals (one per JSONL file). `cost` is the session's
// share of its project's exact ccusage cost (online LiteLLM pricing, cached and
// throttled), distributed by token count — see usage-index rollup.
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

const INDEX_PATH = join(COST_USAGE_DIR, "index.json");

// Pricing (the heavy off-loop ccusage pass) refreshes at most once per this
// window; token freshness is independent and updates on every change. Lazy
// on-serve staleness, not a timer — a cost request triggers at most one pricing
// subprocess per window.
const PRICE_TTL_MS = 5 * 60_000;

// The in-memory index, loaded from disk once per process then kept fresh by
// incremental refresh. A watcher marks it dirty on corpus changes (push-based,
// no TTL poll); every loadBundle also does an on-demand stat-diff as the
// correctness fallback.
let index: UsageIndex | null = null;
let dirty = true;
let refreshInflight: Promise<void> | null = null;
let pricingInflight: Promise<void> | null = null;
let watcherStarted = false;

function deps(): IndexDeps {
  return {
    projectsRoot: CLAUDE_PROJECTS_DIR,
    indexPath: INDEX_PATH,
    costSource: ccusageCostSource,
    // Only main persists the shared host-global index; worktree backends read it
    // and compute any delta in-memory without racing on the write.
    persist: isMain(),
  };
}

async function ensureRefreshed(): Promise<void> {
  index ??= await loadIndex(INDEX_PATH);
  // Main clears `dirty` after a refresh and relies on the watcher to set it
  // again. Worktree backends have no watcher, so they always re-check.
  if (!dirty && isMain()) return;
  refreshInflight ??= (async () => {
    try {
      await refreshIndex(index!, deps());
      dirty = false;
    } finally {
      refreshInflight = null;
    }
  })();
  await refreshInflight;
}

// Refresh the cached price map if stale (>PRICE_TTL_MS), single-flighted so
// concurrent requests never spawn parallel pricing subprocesses. The pass runs
// off the event loop (subprocess) and is TTL-throttled, so it never contributes
// to serving-loop lag.
async function ensurePricedOnce(): Promise<void> {
  pricingInflight ??= (async () => {
    try {
      await ensurePriced(index!, deps(), { ttlMs: PRICE_TTL_MS });
    } finally {
      pricingInflight = null;
    }
  })();
  await pricingInflight;
}

async function buildBundle(): Promise<AggregateBundle> {
  await ensureRefreshed();
  await ensurePricedOnce();
  const mainRoot = await ensureMainWorktreeRoot();
  const [{ daily, sessions }, projectIsSingularity, convBySession] =
    await Promise.all([
      Promise.resolve(rollup(index!)),
      classifyProjects(mainRoot),
      loadConvBySession(),
    ]);
  const decorated = sessions.map(
    (s: SessionRollup): PerSession => ({
      ...s,
      isSingularity: projectIsSingularity.get(s.projectDir) ?? false,
    }),
  );
  return {
    daily,
    sessions: decorated,
    projectIsSingularity,
    convBySession,
  };
}

export async function loadBundle(): Promise<AggregateBundle> {
  return buildBundle();
}

// Called from the server plugin's onReady hook (main-only) so the index is warm
// and the corpus watcher is live before any chart fires its first fetch.
export function prewarmBundle(): void {
  void warmAndWatch();
}

async function warmAndWatch(): Promise<void> {
  await startWatcher();
  await loadBundle();
}

async function startWatcher(): Promise<void> {
  if (watcherStarted || !isMain()) return;
  watcherStarted = true;
  await createFileWatcher({
    dirs: [CLAUDE_PROJECTS_DIR],
    extensions: [".jsonl"],
    onChange: () => {
      // A new/changed transcript: mark the index stale and warm it in the
      // background so the next request finds nothing to do.
      dirty = true;
      void loadBundle();
    },
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function loadConvBySession(): Promise<Map<string, ConvMeta>> {
  const rows = await db
    .select({
      id: _conversations.id,
      title: _conversations.title,
      status: _conversations.status,
      claudeSessionId: _conversations.claudeSessionId,
    })
    .from(_conversations)
    .where(isNotNull(_conversations.claudeSessionId));
  const out = new Map<string, ConvMeta>();
  for (const r of rows) {
    if (r.claudeSessionId) {
      out.set(r.claudeSessionId, {
        conversationId: r.id,
        title: r.title,
        status: r.status,
      });
    }
  }
  return out;
}

// Classify every project dir as Singularity-related or not, by matching the
// encoded path against the main repo basename. Claude encodes project paths
// by replacing `/`, `.`, and `_` with `-`, so /Users/<user>/.../singularity
// becomes `-Users-<user>-...-singularity` and a worktree under it becomes
// `-Users-<user>-...-singularity--claude-worktrees-...`. We match any dir
// ending in `-<basename>` (the main repo) or containing `-<basename>-` (a
// worktree). This deliberately ignores the user prefix so older sessions
// recorded under a different macOS user (e.g. `admin`) still count.
async function classifyProjects(
  mainRoot: string,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const repoBasename = mainRoot.split("/").pop() ?? "";
  if (!repoBasename) return out;
  let dirs: string[];
  try {
    dirs = await readdir(CLAUDE_PROJECTS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return out;
  }
  const tail = `-${repoBasename}`;
  for (const d of dirs) {
    out.set(d, d.endsWith(tail) || d.includes(`${tail}-`));
  }
  return out;
}

// CLI model name (e.g. "opus-4-7-20250101") → registry id "opus-4-7"; falls back to the original name for historical/unknown models.
export function canonicalModel(name: string): string {
  return idForCliName(name) ?? name;
}
