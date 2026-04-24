import { getAttempt } from "@plugins/tasks-core/server";
import { ensureMainWorktreeRoot } from "@server/worktree";

export const MAIN_WORKTREE = "main";

// Resolve a worktree identifier (from the URL) to an absolute filesystem path.
// `"main"` is a reserved sentinel; any other value is looked up as an attempt id.
export async function resolveWorktreePath(id: string): Promise<string | null> {
  if (id === MAIN_WORKTREE) {
    return await ensureMainWorktreeRoot();
  }
  const attempt = await getAttempt(id);
  return attempt?.worktreePath ?? null;
}
