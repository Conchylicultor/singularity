import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { dropDatabase } from "@plugins/database/plugins/admin/server";
import {
  ensureMainWorktreeRoot,
  isCanonicalWorktreePath,
  removeWorktree,
} from "@plugins/infra/plugins/worktree/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

export async function dirExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return false;
  }
}

// The canonical reap sequence shared by the manual delete handlers and the
// automatic reaper job: remove the git worktree (if its dir is still present),
// drop the fork DB, and remove the worktree's config dir.
//
// `onStep` lets the streaming delete handlers surface per-step progress to the
// UI without duplicating the sequence; the background job passes nothing.
export async function reapAttempt(
  id: string,
  opts: { worktreePath?: string; onStep?: (step: "worktree" | "database" | "config") => void },
): Promise<void> {
  if (opts.worktreePath) {
    const root = await ensureMainWorktreeRoot();
    if (isCanonicalWorktreePath(opts.worktreePath, root) && (await dirExists(opts.worktreePath))) {
      opts.onStep?.("worktree");
      await removeWorktree(opts.worktreePath);
    }
  }

  opts.onStep?.("database");
  await dropDatabase(id);

  opts.onStep?.("config");
  await rm(join(SINGULARITY_DIR, "config", id), { recursive: true, force: true });
}
