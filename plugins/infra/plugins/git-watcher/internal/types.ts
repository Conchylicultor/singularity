import { z } from "zod";

export const RefHeadSchema = z.object({
  sha: z.string().nullable(),
});

export type RefHead = z.infer<typeof RefHeadSchema>;

export interface RefAdvancedPayload {
  refName: string;
  sha: string;
  previousSha: string | null;
  [key: string]: unknown;
}
