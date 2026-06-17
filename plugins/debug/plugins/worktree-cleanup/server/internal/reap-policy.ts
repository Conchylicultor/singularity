import { listAttempts } from "@plugins/tasks/plugins/tasks-core/server";
import { listDatabases } from "@plugins/database/plugins/admin/server";
import { worktreePathFor } from "@plugins/infra/plugins/worktree/server";
import { dirExists } from "./reap";

export const AUTO_REAP_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Attempt id == fork DB name. This pattern matches only canonical worktree
// forks: it excludes the main `singularity` DB and the `*__forking` temps
// (which the database.fork-temp-sweep job owns).
const FORK_DB_RE = /^att-\d+-[a-z0-9]+$/;

export interface ReapTarget {
  id: string;
  worktreePath?: string;
}

// Classifies every attempt/fork and returns the set safe to reap autonomously:
//   - ORPHAN: worktree dir gone but fork DB still present.
//   - STALE: worktree dir present, ≥30d old, attempt not active.
//   - DB-ONLY ORPHAN: an att-* fork DB with no attempt row and no worktree dir.
// Git hygiene (dirty/unpushed) is intentionally not consulted — the 30-day
// floor deletes regardless of state, and orphans have nothing to lose.
export async function collectReapable(now: number): Promise<ReapTarget[]> {
  const [attempts, databases] = await Promise.all([listAttempts(), listDatabases()]);

  const dbSet = new Set(databases.filter((name) => FORK_DB_RE.test(name)));
  const targets = new Map<string, ReapTarget>();
  const seenAttemptIds = new Set<string>();

  for (const attempt of attempts) {
    seenAttemptIds.add(attempt.id);
    const dir = await dirExists(attempt.worktreePath);
    const dbExists = dbSet.has(attempt.id);
    const age = now - attempt.createdAt.getTime();

    const orphan = !dir && dbExists;
    const stale = dir && age >= AUTO_REAP_AGE_MS && !attempt.active;

    if (orphan || stale) {
      targets.set(attempt.id, { id: attempt.id, worktreePath: attempt.worktreePath });
    }
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
