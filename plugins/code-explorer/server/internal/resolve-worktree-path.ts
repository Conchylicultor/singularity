import { getAttempt } from "@plugins/tasks/plugins/tasks-core/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";

export const MAIN_WORKTREE = "main";
// The current running server's own worktree root. Distinct from MAIN_WORKTREE,
// which resolves to the main checkout even when serving from a worktree.
export const SELF_WORKTREE = "self";

// Resolve a worktree identifier (from the URL) to an absolute filesystem path.
// `"main"`/`"self"` are reserved sentinels; any other value is looked up as an attempt id.
export async function resolveWorktreePath(id: string): Promise<string | null> {
  if (id === MAIN_WORKTREE) {
    return await ensureMainWorktreeRoot();
  }
  if (id === SELF_WORKTREE) {
    return REPO_ROOT;
  }
  const attempt = await getAttempt(id);
  return attempt?.worktreePath ?? null;
}
