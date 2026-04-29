import { stat } from "node:fs/promises";
import { listAttempts, listTasks } from "@plugins/tasks-core/server";
import { databaseExists } from "@plugins/conversations/server";
import { ensureMainWorktreeRoot } from "@server/worktree";

const GIT = "/usr/bin/git";
const CONCURRENCY = 50;

// Allowlist of task statuses known to have no live agent session.
// Intentionally explicit: unknown/future statuses default to not-safe.
const DELETABLE_TASK_STATUSES = new Set([
  "done",
  "dropped",
]);

type WorktreeEntry = {
  attemptId: string;
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  attemptStatus: string;
  worktreePath: string;
  createdAt: string;
  dirExists: boolean;
  dbExists: boolean;
  unpushedCount: number;
  isDirty: boolean;
  isSafe: boolean;
};

async function dirExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// `git status --porcelain=v2 --branch` gives us branch tracking info (ahead N)
// AND dirty working tree in one subprocess. `du` was removed — it takes ~5s per
// 50-dir batch on macOS even for empty dirs, making it the dominant bottleneck.
async function getGitHygiene(
  wtPath: string,
): Promise<{ unpushedCount: number; isDirty: boolean }> {
  try {
    const p = Bun.spawn(
      [GIT, "-C", wtPath, "status", "--porcelain=v2", "--branch"],
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

export async function handleList(): Promise<Response> {
  try {
    await ensureMainWorktreeRoot();

    const [attempts, tasks] = await Promise.all([listAttempts(), listTasks()]);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const entries = await pMap(attempts, CONCURRENCY, async (attempt): Promise<WorktreeEntry> => {
      const task = taskMap.get(attempt.taskId);
      const [exists, dbPresent] = await Promise.all([
        dirExists(attempt.worktreePath),
        databaseExists(attempt.id),
      ]);

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
    });

    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return Response.json({ ok: true, entries });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
