import { GIT } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

export async function readSha(refName: string): Promise<string | null> {
  const cwd = await ensureMainWorktreeRoot();
  const proc = Bun.spawn([GIT, "rev-parse", "--verify", "--quiet", refName], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) return null;
  const sha = text.trim();
  return sha.length > 0 ? sha : null;
}
