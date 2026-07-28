import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { gitWorktreesDir, worktreePathFor } from "@plugins/infra/plugins/worktree/server";
import { dirExists } from "./reap";

// Canonical worktree-id shape (attempt id == fork DB name == registry entry
// name): `att-<epoch>-<suffix>` / `claude-<epoch>-<suffix>`, plus the legacy
// suffix-less `claude-<epoch>` form still present in the registry. The single
// `-[a-z0-9]+` suffix group (no extra dashes) excludes the per-build data files
// that share the dir (`<name>-build-profile.json`, `<name>-build-logs-<id>.json`)
// and the reserved `singularity`/`central` namespaces and `*__forking` temps
// (owned by the database.fork-temp-sweep job). One source of truth for the
// fork-DB orphan filter, the registry-file orphan filter, the on-disk dir scan,
// and the delete handlers' id validation.
export const WORKTREE_NAME_RE = /^(att|claude)-\d+(-[a-z0-9]+)?$/;

export function isCanonicalWorktreeName(name: string): boolean {
  return WORKTREE_NAME_RE.test(name);
}

export interface WorktreeDir {
  name: string;
  path: string;
}

// Canonical-shaped worktree dirs actually present on disk. A missing parent dir
// (ENOENT) yields an empty list; any other error is surfaced loudly. Reads the
// GIT worktree parent (`<root>/.claude/worktrees`), NOT the `~/.singularity`
// registry that `readRegistryNames` walks.
export async function readWorktreeDirs(root: string): Promise<WorktreeDir[]> {
  const dir = gitWorktreesDir(root);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && isCanonicalWorktreeName(e.name))
      .map((e) => ({ name: e.name, path: join(dir, e.name) }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

// Age of a worktree dir that has no attempt row to date it. `git worktree add`
// creates the dir, so birthtime IS the checkout time. mtime is the fallback for
// filesystems that do not record birthtime (0): it can only ever be NEWER than
// the true creation time, so the fallback can delay a reap but never rush one.
export async function dirAgeMs(path: string, now: number): Promise<number> {
  const st = await stat(path);
  return now - (st.birthtimeMs || st.mtimeMs);
}

// Whether "this dir has no attempt row" is decidable HERE. It is not decidable
// on a worktree backend: its DB is a fork taken at checkout time, so every
// worktree created since the fork is simply absent from its `attempts` table and
// would read as an orphan — including live ones. Only main's table is complete.
//
// These routes are registered on every backend (the Debug pane is per-worktree),
// so without this gate the orphan pass would list live worktrees as abandoned and
// hand their Delete button a loaded gun. The reap job is already main-only for the
// same reason; this is that same scoping, enforced at the classification itself.
export function canClassifyOrphans(): boolean {
  return isMain();
}

// The worktree dir for an id with NO attempt row to name it, or null when there
// is no such dir. The name check is load-bearing, not cosmetic: it is the only
// thing standing between a caller-supplied id and the unguarded `dropDatabase(id)`
// / `rm(<config>/id)` steps inside reapAttempt, which a traversal id would walk
// straight out of. Attempt-backed callers get their path from the row instead.
export async function orphanDirPath(id: string): Promise<string | null> {
  if (!canClassifyOrphans()) return null;
  if (!isCanonicalWorktreeName(id)) return null;
  const path = await worktreePathFor(id);
  return (await dirExists(path)) ? path : null;
}
