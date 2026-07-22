import { dirname, resolve } from "node:path";
import { spawnExpectOk } from "./spawn-captured";

// Memoized per resolved cwd: one git spawn per process instead of one per
// caller (~50 per check run before this existed). The memo stores the PROMISE,
// so concurrent first callers share a single spawn. A rejection stays cached —
// "not a git repo" is a property of the cwd, and every caller must keep
// failing loudly rather than half of them racing a retry.
const worktreeRootMemo = new Map<string, Promise<string>>();
const mainRepoRootMemo = new Map<string, Promise<string>>();

function memoized(
  memo: Map<string, Promise<string>>,
  cwd: string | undefined,
  compute: (base: string) => Promise<string>,
): Promise<string> {
  const base = resolve(cwd ?? process.cwd());
  const hit = memo.get(base);
  if (hit) return hit;
  const entry = compute(base);
  memo.set(base, entry);
  return entry;
}

/**
 * Root of the git checkout containing `cwd` (defaults to the process cwd) —
 * `git rev-parse --show-toplevel`. THROWS (SpawnFailedError) outside a git
 * repo; the old per-file copies absorbed that to `""`, a latent path bug.
 */
export function getWorktreeRoot(cwd?: string): Promise<string> {
  return memoized(worktreeRootMemo, cwd, async (base) => {
    const result = await spawnExpectOk(["git", "rev-parse", "--show-toplevel"], { cwd: base });
    return result.stdout.trim();
  });
}

/**
 * Root of the MAIN repository checkout (the one owning `.git`), even when
 * `cwd` is inside a linked worktree — `dirname(resolve(git rev-parse
 * --git-common-dir))`. THROWS outside a git repo, like `getWorktreeRoot`.
 */
export function getMainRepoRoot(cwd?: string): Promise<string> {
  return memoized(mainRepoRootMemo, cwd, async (base) => {
    const result = await spawnExpectOk(["git", "rev-parse", "--git-common-dir"], { cwd: base });
    // In a worktree this is absolute; in main it may be ".git" (cwd-relative).
    return dirname(resolve(base, result.stdout.trim()));
  });
}
