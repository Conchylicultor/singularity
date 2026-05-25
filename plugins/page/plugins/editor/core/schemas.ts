import { z } from "zod";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const DocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const BlockSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  parentId: z.string().nullable(),
  type: z.string(),
  data: z.unknown(),
  rank: RankSchema,
  expanded: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Block = z.infer<typeof BlockSchema>;
