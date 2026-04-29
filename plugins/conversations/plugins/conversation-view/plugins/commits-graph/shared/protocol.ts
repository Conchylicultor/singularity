import { z } from "zod";

export const CommitDeltaSchema = z.object({
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  mergeBase: z.string().nullable(),
  branch: z.string().nullable(),
});
export type CommitDelta = z.infer<typeof CommitDeltaSchema>;

export const CommitRowSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  subject: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  authoredAt: z.string(),
  parents: z.array(z.string()),
});
export type CommitRow = z.infer<typeof CommitRowSchema>;

export const CommitsGraphSchema = z.object({
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  mergeBase: z.string().nullable(),
  branch: z.string().nullable(),
  commits: z.array(CommitRowSchema),
});
export type CommitsGraph = z.infer<typeof CommitsGraphSchema>;
