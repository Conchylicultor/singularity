import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { WORKTREES_DIR } from "@plugins/infra/plugins/paths/server";

// Enumerate the worktree log-dir names for the disk-backed sources (boot +
// health JSONL), mirroring health-monitor's read-health-files.ts scan: the
// main backend reads every worktree's files straight off disk, so a wedged
// backend still shows up.
export function listWorktreeLogDirs(): string[] {
  let names: string[];
  try {
    names = readdirSync(WORKTREES_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const dirs: string[] = [];
  for (const name of names) {
    // Skip the att-*.json sidecar files; only real worktree dirs have logs/.
    let isDir = false;
    try {
      isDir = statSync(join(WORKTREES_DIR, name)).isDirectory();
    } catch (err) {
      // A worktree dir can vanish mid-scan (concurrent reap); treat as absent.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (isDir) dirs.push(name);
  }
  return dirs;
}
