import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { isNotNull } from "drizzle-orm";
import { loadDailyUsageData, type DailyUsage } from "ccusage/data-loader";
import { db } from "@plugins/database/server";
import { _conversations } from "@plugins/tasks-core/server";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { idForCliName } from "@plugins/conversations/plugins/model-provider/core";

const TTL_MS = 5 * 60_000;

export type Scope = "all" | "singularity";

export interface ConvMeta {
  conversationId: string;
  title: string | null;
  status: string;
}

// Per-conversation token totals (one per JSONL file). `cost` is approximated by
// distributing the project's ccusage-computed totalCost proportionally to this
// file's token count vs the project's total tokens. Exact per-file cost would
// require running ccusage's pricing engine per entry, which is not part of its
// public API surface.
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
  daily: DailyUsage[];
  sessions: PerSession[];
  // Encoded project dir → isSingularity?
  projectIsSingularity: Map<string, boolean>;
  convBySession: Map<string, ConvMeta>;
}

let cache: { ts: number; bundle: AggregateBundle } | null = null;
let inflight: Promise<AggregateBundle> | null = null;

async function buildBundle(): Promise<AggregateBundle> {
  const mainRoot = await ensureMainWorktreeRoot();

  const [daily, projectIsSingularity, convBySession] = await Promise.all([
    loadDailyUsageData({ groupByProject: true }),
    classifyProjects(mainRoot),
    loadConvBySession(),
  ]);
  const sessions = await walkPerSession({ daily, projectIsSingularity });
  return { daily, sessions, projectIsSingularity, convBySession };
}

export async function loadBundle(): Promise<AggregateBundle> {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return cache.bundle;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const bundle = await buildBundle();
      cache = { ts: Date.now(), bundle };
      return bundle;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Called from the server plugin's onReady hook so the cache is warm before any
// chart fires its first fetch.
export function prewarmBundle(): void {
  void loadBundle();
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

interface WalkOpts {
  daily: DailyUsage[];
  projectIsSingularity: Map<string, boolean>;
}

async function walkPerSession({
  daily,
  projectIsSingularity,
}: WalkOpts): Promise<PerSession[]> {
  // Derive per-project totals from the daily rows (ccusage already paid the
  // cost-calc cost there). Used to distribute project cost across its files
  // proportionally to each file's token count.
  const projectTotal = new Map<string, { cost: number; tokens: number }>();
  for (const r of daily) {
    const proj = (r as { project?: string }).project;
    if (!proj) continue;
    const tokens =
      r.inputTokens +
      r.outputTokens +
      r.cacheCreationTokens +
      r.cacheReadTokens;
    const p = projectTotal.get(proj) ?? { cost: 0, tokens: 0 };
    p.cost += r.totalCost;
    p.tokens += tokens;
    projectTotal.set(proj, p);
  }

  let entries: Dirent[];
  try {
    entries = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }
  // Skip non-directory entries (e.g. a stray .DS_Store): only project
  // directories hold session .jsonl files, and readdir'ing a file throws ENOTDIR.
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  // Flatten (projectDir, fileName) pairs, then read all files in parallel.
  const tasks: Promise<PerSession | null>[] = [];
  await Promise.all(
    dirs.map(async (projectDir) => {
      const projInfo = projectTotal.get(projectDir) ?? { cost: 0, tokens: 0 };
      let files: string[];
      try {
        files = await readdir(join(CLAUDE_PROJECTS_DIR, projectDir));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        return;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        tasks.push(
          aggregateOneFile({
            filePath: join(CLAUDE_PROJECTS_DIR, projectDir, f),
            sessionId: basename(f, ".jsonl"),
            projectDir,
            projectTotalCost: projInfo.cost,
            projectTotalTokens: projInfo.tokens,
            isSingularity: projectIsSingularity.get(projectDir) ?? false,
          }),
        );
      }
    }),
  );
  const results = await Promise.all(tasks);
  return results.filter((s): s is PerSession => s !== null);
}

interface AggOpts {
  filePath: string;
  sessionId: string;
  projectDir: string;
  projectTotalCost: number;
  projectTotalTokens: number;
  isSingularity: boolean;
}

async function aggregateOneFile(o: AggOpts): Promise<PerSession | null> {
  const text = await Bun.file(o.filePath).text().catch(() => "");
  if (!text) return null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let lastActivity = "";
  const models = new Set<string>();
  for (const line of text.split("\n")) {
    if (!line) continue;
    let obj: {
      timestamp?: string;
      message?: {
        model?: string;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };
    };
    try {
      obj = JSON.parse(line);
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; parsed JSON may have any shape
    const usage = obj?.message?.usage;
    if (!usage) continue;
    inputTokens += usage.input_tokens ?? 0;
    outputTokens += usage.output_tokens ?? 0;
    cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
    cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    const day = typeof obj.timestamp === "string" ? obj.timestamp.slice(0, 10) : "";
    if (day && day > lastActivity) lastActivity = day;
    if (obj.message?.model) models.add(obj.message.model);
  }
  const totalTokens =
    inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
  if (totalTokens === 0) return null;
  const cost =
    o.projectTotalTokens > 0
      ? (totalTokens / o.projectTotalTokens) * o.projectTotalCost
      : 0;
  return {
    sessionId: o.sessionId,
    projectDir: o.projectDir,
    isSingularity: o.isSingularity,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    cost,
    lastActivity,
    modelsUsed: [...models],
  };
}

// CLI model name (e.g. "opus-4-7-20250101") → registry id "opus-4-7"; falls back to the original name for historical/unknown models.
export function canonicalModel(name: string): string {
  return idForCliName(name) ?? name;
}
