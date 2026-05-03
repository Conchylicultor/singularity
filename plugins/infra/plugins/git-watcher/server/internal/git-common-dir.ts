import { GIT } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

let cached: string | null = null;

// Resolve the shared `.git` directory once. In a worktree this points at the
// main repo's `.git`, which is where `refs/heads/*` and `packed-refs` actually
// live — both worktree-local and main-worktree branch updates land there.
export async function gitCommonDir(): Promise<string> {
  if (cached) return cached;
  const cwd = await ensureMainWorktreeRoot();
  const proc = Bun.spawn([GIT, "rev-parse", "--git-common-dir"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`git rev-parse --git-common-dir failed: ${err.trim()}`);
  }
  const raw = text.trim();
  // `--git-common-dir` returns a path relative to cwd when the repo's .git
  // is co-located. Resolve against the worktree root so callers can pass it
  // straight to fs APIs.
  cached = raw.startsWith("/") ? raw : `${cwd}/${raw}`;
  return cached;
}
