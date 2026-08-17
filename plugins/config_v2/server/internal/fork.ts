import { cp, stat } from "node:fs/promises";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/server";
import { configDir } from "../../data-dirs";

export async function forkConfig(targetWorktree: string): Promise<void> {
  const sourceDir = configDir.file(MAIN_WORKTREE_NAME);
  const targetDir = configDir.file(targetWorktree);
  try {
    await stat(sourceDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return;
  }
  await cp(sourceDir, targetDir, { recursive: true });
}
