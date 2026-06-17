import { listAttempts, listTasks } from "@plugins/tasks/plugins/tasks-core/server";
import { listDatabases } from "@plugins/database/plugins/admin/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { ndjsonResponse } from "../../shared/ndjson";
import { type WorktreeEntry } from "../../shared/endpoints";
import { dirExists } from "./reap";

import { GIT } from "@plugins/infra/plugins/paths/server";
const CONCURRENCY = 50;

// Allowlist of task statuses known to have no live agent session.
// Intentionally explicit: unknown/future statuses default to not-safe.
const DELETABLE_TASK_STATUSES = new Set([
  "done",
  "dropped",
]);

// `git status --porcelain=v2 --branch` gives us branch tracking info (ahead N)
// AND dirty working tree in one subprocess. `du` was removed — it takes ~5s per
// 50-dir batch on macOS even for empty dirs, making it the dominant bottleneck.
async function getGitHygiene(
  wtPath: string,
): Promise<{ unpushedCount: number; isDirty: boolean }> {
  try {
    const p = Bun.spawn(
      [GIT, "--no-optional-locks", "-C", wtPath, "status", "--porcelain=v2", "--branch"],
      { stdout: "pipe", stderr: "pipe" },
    );
    await p.exited;
    const statusOut = await new Response(p.stdout).text();

    // Header line: "# branch.ab +<ahead> -<behind>"
    const abLine = statusOut.split("\n").find((l) => l.startsWith("# branch.ab "));
    const aheadMatch = abLine?.match(/\+(\d+)/);
    const unpushedCount = aheadMatch ? parseInt(aheadMatch[1]!, 10) : 0;

    // Any non-header line is a file change
    const isDirty = statusOut.split("\n").some((l) => l.length > 0 && !l.startsWith("#"));

    return { unpushedCount, isDirty };
  // eslint-disable-next-line promise-safety/no-bare-catch -- git spawn can fail for many reasons (binary missing, worktree deleted mid-flight, not a git repo); all map to the same conservative safe default (assume dirty = not safe to delete), so every error is correctly handled here
  } catch {
    return { unpushedCount: 0, isDirty: true };
  }
}

// Run `fn` over `items` with at most `limit` concurrent executions.
async function pMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type Attempt = Awaited<ReturnType<typeof listAttempts>>[number];
type Task = Awaited<ReturnType<typeof listTasks>>[number];

async function buildEntry(
  attempt: Attempt,
  taskMap: Map<string, Task>,
  dbSet: Set<string>,
): Promise<WorktreeEntry> {
  const task = taskMap.get(attempt.taskId);
  const exists = await dirExists(attempt.worktreePath);
  const dbPresent = dbSet.has(attempt.id);

  let unpushedCount = 0;
  let isDirty = false;

  if (exists) {
    const hygiene = await getGitHygiene(attempt.worktreePath);
    unpushedCount = hygiene.unpushedCount;
    isDirty = hygiene.isDirty;
  }

  const taskDeletable = task ? DELETABLE_TASK_STATUSES.has(task.status) : true;
  const ageMs = Date.now() - attempt.createdAt.getTime();
  const oldEnough = ageMs >= 72 * 60 * 60 * 1000;
  // No worktree but DB remains: always safe (nothing to lose, just a DB drop).
  // Worktree present: safe only when clean, old enough, and task is done/dropped.
  const isSafe = (!exists && dbPresent) || (exists && unpushedCount === 0 && !isDirty && taskDeletable && oldEnough);

  return {
    attemptId: attempt.id,
    taskId: attempt.taskId,
    taskTitle: task?.title ?? "(unknown task)",
    taskStatus: task?.status ?? "unknown",
    attemptStatus: attempt.status,
    worktreePath: attempt.worktreePath,
    createdAt: attempt.createdAt.toISOString(),
    dirExists: exists,
    dbExists: dbPresent,
    unpushedCount,
    isDirty,
    isSafe,
  };
}

// Streamed NDJSON: each computed worktree row is emitted as it completes,
// followed by a terminal `{ end: true }` sentinel. Streaming keeps the socket
// alive past Bun's 10s idleTimeout (1257 worktrees × git status >> 10s) and lets
// rows render progressively. Errors inside the producer are framed as `{ error }`
// by ndjsonResponse, so no try/catch is needed here. No server-side sort — rows
// stream in completion order and the client sorts.
export function handleList(): Response {
  return ndjsonResponse(async (emit) => {
    await ensureMainWorktreeRoot();

    // One catalog query for all DB names instead of an N+1 `databaseExists`
    // per attempt — with 2000+ attempts the per-row query was the dominant
    // cost that pushed the request past Bun's 10s idleTimeout.
    const [attempts, tasks, databases] = await Promise.all([
      listAttempts(),
      listTasks(),
      listDatabases(),
    ]);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const dbSet = new Set(databases);

    await pMap(attempts, CONCURRENCY, async (attempt) => {
      emit({ item: await buildEntry(attempt, taskMap, dbSet) });
    });

    emit({ end: true });
  });
}
