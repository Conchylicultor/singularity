import { z } from "zod";

export { CommitRowSchema } from "@plugins/primitives/plugins/commit-list/core";
export type { CommitRow } from "@plugins/primitives/plugins/commit-list/core";

// Re-import for local use by CommitsGraphSchema below.
import { CommitRowSchema } from "@plugins/primitives/plugins/commit-list/core";

export const CommitDeltaSchema = z.object({
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  mergeBase: z.string().nullable(),
  branch: z.string().nullable(),
});
export type CommitDelta = z.infer<typeof CommitDeltaSchema>;

export const CommitsGraphSchema = z.object({
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  mergeBase: z.string().nullable(),
  branch: z.string().nullable(),
  commits: z.array(CommitRowSchema),
  /** Commits already merged into main via `./singularity push`, newest-first. */
  landedCommits: z.array(CommitRowSchema),
  /** Commits on main that this branch doesn't have yet (capped at 50), newest-first. */
  behindCommits: z.array(CommitRowSchema),
});
export type CommitsGraph = z.infer<typeof CommitsGraphSchema>;
