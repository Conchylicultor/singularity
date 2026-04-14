const GIT = "/usr/bin/git";

export const CONVERSATION_PREFIX = "claude";

let cachedRepoRoot: string | null = null;

// The main worktree root (parent of all `.claude/worktrees/*`), not the
// current worktree — `git rev-parse --show-toplevel` would return the latter
// when the server runs inside a worktree.
export async function getMainWorktreeRoot(): Promise<string> {
  if (cachedRepoRoot) return cachedRepoRoot;
  const proc = Bun.spawn([GIT, "worktree", "list", "--porcelain"], {
    stdout: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  const firstLine = text.split("\n").find((l) => l.startsWith("worktree "));
  if (!firstLine) throw new Error("Could not determine main worktree root");
  cachedRepoRoot = firstLine.slice("worktree ".length).trim();
  return cachedRepoRoot;
}

export async function worktreePathFor(id: string): Promise<string> {
  const root = await getMainWorktreeRoot();
  return `${root}/.claude/worktrees/${id}`;
}

export async function setupWorktree(id: string, wtPath: string): Promise<void> {
  const repoRoot = await getMainWorktreeRoot();
  const branch = `claude-web/${id}`;
  await Bun.spawn(
    [GIT, "-C", repoRoot, "worktree", "add", "-b", branch, wtPath, "main"],
    { stdout: "pipe", stderr: "pipe" },
  ).exited;
}
