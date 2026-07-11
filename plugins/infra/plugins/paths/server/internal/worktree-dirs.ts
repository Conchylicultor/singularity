import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { WORKTREES_DIR } from "../../core/internal/paths";

// Enumerate the real worktree directory names under WORKTREES_DIR. The dir
// also holds non-directory entries (att-*.json sidecars, Finder .DS_Store) —
// only directories have logs/, so anything else is skipped. A missing
// WORKTREES_DIR means "no worktrees yet" and yields [].
export function listWorktreeDirs(): string[] {
  return listDirNames(WORKTREES_DIR);
}

// Parameterized on dir only so the co-located test can run against a temp dir.
export function listDirNames(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const dirs: string[] = [];
  for (const name of names) {
    let isDir = false;
    try {
      isDir = statSync(join(dir, name)).isDirectory();
    } catch (err) {
      // A worktree dir can vanish mid-scan (concurrent reap); treat as absent.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (isDir) dirs.push(name);
  }
  return dirs;
}
