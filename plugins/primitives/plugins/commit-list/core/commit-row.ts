import { z } from "zod";

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
