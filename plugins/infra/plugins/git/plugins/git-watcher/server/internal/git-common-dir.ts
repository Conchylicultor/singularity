import { GIT } from "@plugins/infra/plugins/paths/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

// A single `rev-parse` metadata read, taken once per process on the git
// watcher's setup path — where a child that never returns would leave ref
// watching silently never armed. Thirty seconds is only ever reached by a wedge.
const GIT_TIMEOUT_MS = 30_000;

let cached: string | null = null;

// Resolve the shared `.git` directory once. In a worktree this points at the
// main repo's `.git`, which is where `refs/heads/*` and `packed-refs` actually
// live — both worktree-local and main-worktree branch updates land there.
export async function gitCommonDir(): Promise<string> {
  if (cached) return cached;
  const cwd = await ensureMainWorktreeRoot();
  const result = await spawnCaptured([GIT, "rev-parse", "--git-common-dir"], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git rev-parse --git-common-dir failed: ${result.stderr.trim()}`,
    );
  }
  const raw = result.stdout.trim();
  // `--git-common-dir` returns a path relative to cwd when the repo's .git
  // is co-located. Resolve against the worktree root so callers can pass it
  // straight to fs APIs.
  cached = raw.startsWith("/") ? raw : `${cwd}/${raw}`;
  return cached;
}
