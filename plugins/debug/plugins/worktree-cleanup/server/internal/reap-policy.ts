import { readdir } from "node:fs/promises";
import { listAttempts, listTasks } from "@plugins/tasks/plugins/tasks-core/server";
import { listDatabases } from "@plugins/database/plugins/admin/server";
import {
  ensureMainWorktreeRoot,
  isCanonicalWorktreePath,
  worktreePathFor,
  worktreesDir,
} from "@plugins/infra/plugins/worktree/server";
import { dirExists } from "./reap";
import { getGitHygiene, isSafeToReap, isTaskDeletable } from "./safety";

// Abandonment backstop. Deliberately status-agnostic: it fires even for a task
// the 72h clean path refuses to touch (held, in-progress, dirty, unpushed), so
// nothing can pin a worktree on disk forever. 90 days rather than 30 because a
// *held* task is parked work the user means to resume — the shorter floor was
// reaping held worktrees out from under them well before they came back — but a
// hard cleanup is still a hard cleanup, so the floor is raised, not removed.
export const AUTO_REAP_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Canonical worktree-id shape (attempt id == fork DB name == registry entry
// name): `att-<epoch>-<suffix>` / `claude-<epoch>-<suffix>`, plus the legacy
// suffix-less `claude-<epoch>` form still present in the registry. The single
// `-[a-z0-9]+` suffix group (no extra dashes) excludes the per-build data files
// that share the dir (`<name>-build-profile.json`, `<name>-build-logs-<id>.json`)
// and the reserved `singularity`/`central` namespaces and `*__forking` temps
// (owned by the database.fork-temp-sweep job). One source of truth for both the
// fork-DB orphan filter and the registry-file orphan filter below.
const WORKTREE_NAME_RE = /^(att|claude)-\d+(-[a-z0-9]+)?$/;

// Canonical-shaped registry entry names on disk (new `<name>/` subdir or legacy
// flat `<name>.json`) under the gateway registry dir. A missing dir (ENOENT)
// yields an empty set; any other error is surfaced loudly.
async function readRegistryNames(): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    const entries = await readdir(worktreesDir(), { withFileTypes: true });
    for (const e of entries) {
      const name = e.isDirectory() ? e.name : e.name.replace(/\.json$/, "");
      if (WORKTREE_NAME_RE.test(name)) names.add(name);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return names;
}

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
//   - HARD FLOOR (≥90d): abandonment backstop — drop even dirty/unpushed dirs,
//     and even held tasks, which the clean path deliberately never reaps.
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
  const dbSet = new Set(databases.filter((name) => WORKTREE_NAME_RE.test(name)));
  // A worktree's gateway spec file is an artifact to reclaim just like its fork
  // DB, so the on-disk registry set joins dbSet as a signal that an inactive
  // attempt whose dir is gone still has something to clean (its registry entry
  // anchors a gateway registration + fsnotify watch even after the DB is gone).
  const registrySet = await readRegistryNames();
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
    const hasRegistry = registrySet.has(attempt.id);
    // Nothing left to reclaim — dir, fork DB, and registry entry all gone (a
    // fully-cleaned or malformed row). Skipping avoids perpetual no-op reaps.
    if (!hasDir && !hasDB && !hasRegistry) return null;

    const age = now - attempt.createdAt.getTime();

    if (!hasDir) {
      // Orphan: dir gone, but a fork DB and/or a gateway registry entry linger.
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

  // DB-only orphans: att-*/claude-* fork DBs with no matching attempt row. Reap
  // when the resolved worktree dir is absent (nothing to remove, just drop DB).
  for (const id of dbSet) {
    if (seenAttemptIds.has(id) || targets.has(id)) continue;
    if (!(await dirExists(await worktreePathFor(id)))) {
      targets.set(id, { id });
    }
  }

  // Registry-file orphans: a spec entry on disk whose git worktree dir is gone
  // and which has NO attempt row (attempt-backed entries are reclaimed above via
  // the hasRegistry signal). These predate the attempt system or had their rows
  // deleted. Removing the spec file deregisters the namespace from the gateway
  // and frees its fsnotify watch (reapAttempt's "registry" step).
  for (const name of registrySet) {
    if (seenAttemptIds.has(name) || targets.has(name)) continue; // covered/active already
    if (!(await dirExists(await worktreePathFor(name)))) {
      targets.set(name, { id: name }); // no worktree dir: a true orphan
    }
  }

  return [...targets.values()];
}
