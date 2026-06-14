import { GIT, REPO_ROOT } from "@plugins/infra/plugins/paths/server";

// The full ref name (`refs/heads/<branch>`) this worktree's HEAD points at, or
// null when HEAD is detached. Resolved against the current worktree's checkout
// (REPO_ROOT) — this is the ref a local commit / rebase / sync-to-head advances.
export async function currentBranchRef(): Promise<string | null> {
  const proc = Bun.spawn([GIT, "symbolic-ref", "--quiet", "HEAD"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) return null; // detached HEAD
  const ref = text.trim();
  return ref.length > 0 ? ref : null;
}
