import { z } from "zod";

// Pure Zod schemas for yak-shaving types — no drizzle imports, safe to use in
// shared/ and web/. The server schema.ts re-exports from here.

export const YakShavingNodeSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  parentNodeId: z.string().nullable(),
  parentCategoryId: z.string().nullable(),
  oneLineContext: z.string().nullable(),
  nextAction: z.string().nullable(),
  status: z.string().nullable(),
  rank: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type YakShavingNode = z.infer<typeof YakShavingNodeSchema>;

export const YakShavingCategorySchema = z.object({
  id: z.string(),
  parentCategoryId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  rank: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type YakShavingCategory = z.infer<typeof YakShavingCategorySchema>;
