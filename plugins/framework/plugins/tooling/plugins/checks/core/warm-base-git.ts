// The two git questions the warm-base pool asks, and nothing else.
//
// "Which commit is this worktree on?" labels a published base, and "is that
// commit an ancestor of main?" is what decides whether a base survives the
// prune. Both are facts about the repository that the pool itself cannot
// compute, and both can legitimately be UNAVAILABLE — a detached checkout with
// no `main`, a git binary that is not there, a spawn that times out. So each
// answers with a discriminated result carrying the reason, never a bare
// boolean that folds "no" and "could not tell" together: the first means
// "drop this entry", the second means "do not touch it".
//
// Behind an interface so the tests can drive the selection and retention rules
// without a real repository. The real implementation is the default argument
// everywhere, so nothing in production has to pass one.

import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

// A wedge-breaker, not a latency budget: `rev-parse` and `merge-base` are
// metadata reads that finish in milliseconds, but they run on a box that may be
// hosting several agent fleets, and a hung git would otherwise hold the
// preparation thread's finalize open forever.
const GIT_TIMEOUT_MS = 30_000;

/** A git fact, or the reason there is none. Never a value standing in for "unknown". */
export type GitFactResult<T> =
  { ok: true; value: T } | { ok: false; reason: string };

export interface WarmBaseGitFacts {
  /** Full sha of `HEAD` in `root`. */
  headSha(root: string): Promise<GitFactResult<string>>;
  /**
   * Is `sha` an ancestor of `main` (or `main` itself)?
   *
   * `{ ok: true, value: false }` is a real answer — the commit is on some
   * branch that never merged — and is what lets the prune drop an entry.
   */
  isAncestorOfMain(root: string, sha: string): Promise<GitFactResult<boolean>>;
}

async function git(
  root: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await spawnCaptured(["git", ...args], {
    cwd: root,
    env: process.env,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

export const realGitFacts: WarmBaseGitFacts = {
  async headSha(root) {
    const r = await git(root, ["rev-parse", "HEAD"]);
    if (r.exitCode !== 0) {
      return { ok: false, reason: `rev-parse HEAD exited ${r.exitCode}` };
    }
    if (!/^[0-9a-f]{40,64}$/.test(r.stdout)) {
      return {
        ok: false,
        reason: `rev-parse HEAD said ${JSON.stringify(r.stdout)}`,
      };
    }
    return { ok: true, value: r.stdout };
  },

  async isAncestorOfMain(root, sha) {
    // `--is-ancestor` answers by EXIT CODE: 0 yes, 1 no, anything else means
    // the question could not be asked (an unknown sha after a gc, no `main`
    // ref in this checkout). Only the first two are answers.
    const r = await git(root, ["merge-base", "--is-ancestor", sha, "main"]);
    if (r.exitCode === 0) return { ok: true, value: true };
    if (r.exitCode === 1) return { ok: true, value: false };
    return {
      ok: false,
      reason: `merge-base --is-ancestor ${sha} main exited ${r.exitCode}${r.stderr ? `: ${r.stderr}` : ""}`,
    };
  },
};
