import { cp, stat } from "node:fs/promises";
import { join } from "node:path";
import { SINGULARITY_DIR, MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/server";

export async function forkConfig(targetWorktree: string): Promise<void> {
  const sourceDir = join(SINGULARITY_DIR, "config", MAIN_WORKTREE_NAME);
  const targetDir = join(SINGULARITY_DIR, "config", targetWorktree);
  try {
    await stat(sourceDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return;
  }
  await cp(sourceDir, targetDir, { recursive: true });
}
