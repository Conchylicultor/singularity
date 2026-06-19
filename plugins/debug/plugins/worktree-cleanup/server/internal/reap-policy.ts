import { listAttempts, listTasks } from "@plugins/tasks/plugins/tasks-core/server";
import { listDatabases } from "@plugins/database/plugins/admin/server";
import {
  ensureMainWorktreeRoot,
  isCanonicalWorktreePath,
  worktreePathFor,
} from "@plugins/infra/plugins/worktree/server";
import { dirExists } from "./reap";
import { getGitHygiene, isSafeToReap, isTaskDeletable } from "./safety";

export const AUTO_REAP_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Attempt id == fork DB name. This pattern matches only canonical worktree
// forks: it excludes the main `singularity` DB and the `*__forking` temps
// (which the database.fork-temp-sweep job owns).
const FORK_DB_RE = /^att-\d+-[a-z0-9]+$/;

export interface ReapTarget {
  id: string;
  worktreePath?: string;
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

// Classifies every attempt/fork and returns the set safe to reap autonomously.
// This now shares the SAME `isSafeToReap` predicate as the UI safe-to-delete
// badge (handle-list), so the scheduled reaper and the UI can never drift:
//   - ORPHAN: worktree dir gone but fork DB still present → drop the DB.
//   - CLEAN PATH (isSafe @ 72h): dir present, pushed + clean + task done/dropped
//     + ≥72h old — the hygiene-aware "nothing to lose" set.
//   - HARD FLOOR (≥30d): abandonment backstop — drop even dirty/unpushed dirs.
//   - DB-ONLY ORPHAN: an att-* fork DB with no attempt row and no worktree dir.
// Active attempts are NEVER reaped. A worktreePath that is not a canonical child
// of `<root>/.claude/worktrees/` (the main repo root, /tmp, a hand-edited path)
// is never treated as a removable dir — only its fork DB is reaped.
export async function collectReapable(now: number): Promise<ReapTarget[]> {
  const root = await ensureMainWorktreeRoot();
  const [attempts, tasks, databases] = await Promise.all([
    listAttempts(),
    listTasks(),
    listDatabases(),
  ]);

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const dbSet = new Set(databases.filter((name) => FORK_DB_RE.test(name)));
  const targets = new Map<string, ReapTarget>();
  const seenAttemptIds = new Set<string>();

  for (const attempt of attempts) seenAttemptIds.add(attempt.id);

  // getGitHygiene spawns git, so classify attempts with bounded concurrency.
  // Hygiene only runs for inactive canonical-dir candidates.
  const classified = await pMap(attempts, 24, async (attempt): Promise<ReapTarget | null> => {
    if (attempt.active) return null; // NEVER reap an active attempt

    const hasDir =
      isCanonicalWorktreePath(attempt.worktreePath, root) &&
      (await dirExists(attempt.worktreePath));
    const hasDB = dbSet.has(attempt.id);
    if (!hasDir && !hasDB) return null; // malformed row / already cleaned

    const age = now - attempt.createdAt.getTime();

    if (!hasDir) {
      // orphan: dir gone but fork DB present.
      return { id: attempt.id, worktreePath: attempt.worktreePath };
    }

    const { unpushedCount, isDirty } = await getGitHygiene(attempt.worktreePath);
    const taskDeletable = isTaskDeletable(taskMap.get(attempt.taskId)?.status);
    const safe = isSafeToReap({
      dirExists: true,
      dbPresent: hasDB,
      unpushedCount,
      isDirty,
      taskDeletable,
      ageMs: age,
    });
    const hardFloor = age >= AUTO_REAP_AGE_MS; // abandonment backstop
    if (safe || hardFloor) {
      return { id: attempt.id, worktreePath: attempt.worktreePath };
    }
    return null;
  });

  for (const target of classified) {
    if (target) targets.set(target.id, target);
  }

  // DB-only orphans: att-* fork DBs with no matching attempt row. Reap when the
  // resolved worktree dir is absent (nothing to remove, just drop the DB).
  for (const id of dbSet) {
    if (seenAttemptIds.has(id) || targets.has(id)) continue;
    if (!(await dirExists(await worktreePathFor(id)))) {
      targets.set(id, { id });
    }
  }

  return [...targets.values()];
}
