import { tryRunGit, GitError } from "@plugins/primitives/plugins/commit-list/server";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

// Exit-code contract for `git rev-parse --verify --quiet <ref>`:
//   exit 0 → the ref resolves; its sha is on stdout.
//   exit 1 → the ref genuinely does not resolve (absent/deleted). With
//            `--verify --quiet` this is git's documented "not a valid object"
//            signal — a REAL answer, returned as null.
//   other  → a genuine git failure (bad repo, spawn error, …). This must NOT be
//            conflated with "ref absent": it throws so the caller keeps its
//            last-known-good sha and fires no spurious refHead advance.
export async function readSha(refName: string): Promise<string | null> {
  const cwd = await ensureMainWorktreeRoot();
  const args = ["rev-parse", "--verify", "--quiet", refName];
  const res = await tryRunGit(args, cwd);
  if (!res.ok) {
    if (res.exitCode === 1) return null;
    throw new GitError({ args, cwd, exitCode: res.exitCode, stderr: res.stderr });
  }
  const sha = res.stdout.trim();
  return sha.length > 0 ? sha : null;
}
