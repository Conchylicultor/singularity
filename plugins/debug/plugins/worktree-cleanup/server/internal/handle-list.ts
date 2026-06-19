import { listAttempts, listTasks } from "@plugins/tasks/plugins/tasks-core/server";
import { listDatabases } from "@plugins/database/plugins/admin/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { ndjsonResponse } from "@plugins/infra/plugins/ndjson-stream/server";
import { type WorktreeEntry } from "../../shared/endpoints";
import { dirExists } from "./reap";
import { getGitHygiene, isTaskDeletable, isSafeToReap } from "./safety";

const CONCURRENCY = 50;

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

  const taskDeletable = isTaskDeletable(task?.status);
  const isSafe = isSafeToReap({
    dirExists: exists,
    dbPresent,
    unpushedCount,
    isDirty,
    taskDeletable,
    ageMs: Date.now() - attempt.createdAt.getTime(),
  });

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
