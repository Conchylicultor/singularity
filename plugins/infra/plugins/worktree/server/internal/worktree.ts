import { GIT } from "@plugins/infra/plugins/paths/server";

let cachedRepoRoot: string | null = null;

// The main worktree root (parent of all `.claude/worktrees/*`), not the
// current worktree — `git rev-parse --show-toplevel` would return the latter
// when the server runs inside a worktree.
export async function ensureMainWorktreeRoot(): Promise<string> {
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
  const root = await ensureMainWorktreeRoot();
  return `${root}/.claude/worktrees/${id}`;
}

export async function setupWorktree(id: string, wtPath: string): Promise<void> {
  const repoRoot = await ensureMainWorktreeRoot();
  const branch = `claude-web/${id}`;
  await Bun.spawn(
    [GIT, "-C", repoRoot, "worktree", "add", "-b", branch, wtPath, "main"],
    { stdout: "pipe", stderr: "pipe" },
  ).exited;
  // Trust the mise config so agents can run build commands without hitting
  // "config file is not trusted" errors. No-op if mise is not installed.
  try {
    await Bun.spawn(["mise", "trust", `${wtPath}/mise.toml`], {
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {}
}

export async function removeWorktree(wtPath: string): Promise<void> {
  const repoRoot = await ensureMainWorktreeRoot();
  const proc = Bun.spawn(
    [GIT, "-C", repoRoot, "worktree", "remove", wtPath, "--force"],
    { stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`git worktree remove failed: ${err}`);
  }
}
