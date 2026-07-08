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
import { defineCorpusIndex } from "@plugins/infra/plugins/corpus-index/server";
import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import { idForCliName } from "@plugins/conversations/plugins/model-provider/core";
import { ccusageCostSource } from "./ccusage-cost-source";
import {
  ensurePriced,
  INDEX_VERSION,
  loadPricing,
  parseTranscript,
  rollup,
  type DailyRow,
  type FilePartial,
  type PricingDeps,
  type PricingHolder,
  type SessionRollup,
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
const PRICING_PATH = join(COST_USAGE_DIR, "pricing.json");

// Pricing (the heavy off-loop ccusage pass) refreshes at most once per this
// window; token freshness is independent and updates on every change. Lazy
// on-serve staleness, not a timer — a cost request triggers at most one pricing
// subprocess per window.
const PRICE_TTL_MS = 5 * 60_000;

// The incremental host-global transcript index — the generic mechanics
// (enumerate → (mtime,size) fingerprint diff → bounded parse → atomic persist →
// drop-vanished) live in `infra/corpus-index`; this instance supplies the
// cost-specific `parseTranscript`. Only main persists the shared index; worktree
// backends read it and compute any delta in-memory (scope: "host"). Every
// loadBundle calls `ensureFresh()` — the lazy on-read stat-diff correctness
// fallback that makes the deferred warmup safe.
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

// Pricing is persisted separately from the corpus index (a sibling
// `pricing.json`) so each file has a single writer: the corpus index owns
// `index.json`, this holder owns `pricing.json`. Loaded from disk once per
// process, then kept fresh (TTL) via the throttled off-loop pass.
const pricingHolder: PricingHolder = {};
let pricingLoaded = false;
let pricingInflight: Promise<void> | null = null;

function pricingDeps(): PricingDeps {
  return {
    costSource: ccusageCostSource,
    // Only main persists the shared host-global pricing snapshot; worktree
    // backends read it and compute in-memory without racing on the write.
    persist: isMain(),
    pricingPath: PRICING_PATH,
  };
}

// Refresh the cached price map if stale (>PRICE_TTL_MS), single-flighted so
// concurrent requests never spawn parallel pricing subprocesses. The pass runs
// off the event loop (subprocess) and is TTL-throttled, so it never contributes
// to serving-loop lag.
async function ensurePricedOnce(): Promise<void> {
  pricingInflight ??= (async () => {
    try {
      if (!pricingLoaded) {
        pricingHolder.pricing = await loadPricing(PRICING_PATH);
        pricingLoaded = true;
      }
      await ensurePriced(pricingHolder, pricingDeps(), { ttlMs: PRICE_TTL_MS });
    } finally {
      pricingInflight = null;
    }
  })();
  await pricingInflight;
}

async function buildBundle(): Promise<AggregateBundle> {
  await costIndex.ensureFresh();
  await ensurePricedOnce();
  const mainRoot = await ensureMainWorktreeRoot();
  const [{ daily, sessions }, projectIsSingularity, convBySession] =
    await Promise.all([
      Promise.resolve(rollup(costIndex.entries(), pricingHolder.pricing)),
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

// Declared heavy boot warm-up (replacing the former raw `onReady` prewarm): warm
// the host-global usage index + pricing and start the corpus watcher on MAIN
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
  await loadBundle();
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
