/**
 * How a bundle's recorded source commit relates to the repo's current `HEAD`.
 *
 * The load-bearing member is `unknown`. A bundle built from a dirty worktree,
 * one carrying no `commitSha` at all, and one naming a commit this repository
 * has never seen are all *unprovable* — and an unprovable answer is reported as
 * unknown, never softened into `current`. "Did I test the code I am shipping?"
 * is a question that must be allowed to answer "I cannot tell".
 */
export type Staleness =
  | { kind: "current" }
  /** The sha is an ancestor of HEAD, `commits` behind it. */
  | { kind: "behind"; commits: number }
  /** The sha is a real commit here, but not on HEAD's first-parent history. */
  | { kind: "diverged"; sha: string }
  | { kind: "unknown"; reason: string };

/**
 * The reason a dirty build is always `unknown`. Exported as a constant so the
 * sentence the UI shows and the sentence the engine mints are the same one.
 */
export const DIRTY_WORKTREE_REASON =
  "built from a dirty worktree — the sha names the parent commit, not the bytes";
