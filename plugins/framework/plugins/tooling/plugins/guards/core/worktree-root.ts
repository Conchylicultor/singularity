/**
 * Derives the agent's worktree root and the main-repo root from a path.
 *
 * The PreToolUse hook's cwd tracks the session shell's persistent `cd`, so it
 * can sit anywhere INSIDE the worktree — never use raw cwd as an edit/write
 * boundary. Doing so misfires the moment a command cd's into a subdirectory:
 * boundary checks then block legitimate sibling-dir edits inside the agent's
 * own worktree (main-edits false positive, 2026-07-07) and, worse, mis-derive
 * the repo root so writes to the actual main checkout stop being caught
 * (main-writes).
 */

const WORKTREE_MARKER = "/.claude/worktrees/";

export interface WorktreeContext {
  /** The agent's own worktree checkout: `<repoRoot>/.claude/worktrees/<name>`. */
  worktreeRoot: string;
  /** The main repo checkout the worktree hangs off. */
  repoRoot: string;
}

/** null when the path is not inside a worktree checkout. */
export function worktreeContextOf(path: string): WorktreeContext | null {
  // lastIndexOf: were a worktree ever checked out inside another worktree,
  // the innermost one is the session's own.
  const idx = path.lastIndexOf(WORKTREE_MARKER);
  if (idx === -1) return null;
  const nameStart = idx + WORKTREE_MARKER.length;
  const nameEnd = path.indexOf("/", nameStart);
  const worktreeRoot = nameEnd === -1 ? path : path.slice(0, nameEnd);
  // The worktrees dir itself (trailing slash, no name segment) is no worktree.
  if (worktreeRoot.length === nameStart) return null;
  return { worktreeRoot, repoRoot: path.slice(0, idx) };
}
