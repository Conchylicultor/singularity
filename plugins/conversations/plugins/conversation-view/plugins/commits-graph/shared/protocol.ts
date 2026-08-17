import { z } from "zod";
import { resolvableSchema } from "@plugins/primitives/plugins/live-state/core";

export { CommitRowSchema } from "@plugins/primitives/plugins/commit-list/core";
export type { CommitRow } from "@plugins/primitives/plugins/commit-list/core";

// Re-import for local use by CommitsGraphSchema below.
import { CommitRowSchema } from "@plugins/primitives/plugins/commit-list/core";

// The inner shape — the graph a measured branch yields. It is wrapped in
// `Resolvable` for the wire (below); an attempt whose worktree is gone has no
// checkout to draw, so its payload is `unresolved(...)`, NOT a `{ahead: 0, …}`
// that lies about a branch nobody looked at.
export const CommitsGraphSchema = z.object({
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  mergeBase: z.string().nullable(),
  branch: z.string().nullable(),
  commits: z.array(CommitRowSchema),
  /**
   * Commits of this attempt that `main` already contains, newest-first. Measured
   * from git (the `Singularity-Conversation` trailers on `main`), not from the
   * `pushes` ledger — see `tasks/attempt-work`.
   */
  landedCommits: z.array(CommitRowSchema),
  /** Commits on main that this branch doesn't have yet (capped at 50), newest-first. */
  behindCommits: z.array(CommitRowSchema),
});
export type CommitsGraph = z.infer<typeof CommitsGraphSchema>;

// Wire payload: the measured value, or a determinate "worktree unavailable"
// non-value (`{resolved: false, reason}`). See
// research/2026-07-09-global-resource-unknown-value-and-error-gate.md.
export const CommitsGraphPayloadSchema = resolvableSchema(CommitsGraphSchema);
export type CommitsGraphPayload = z.infer<typeof CommitsGraphPayloadSchema>;
