import { z } from "zod";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

// A block is the single node type. A page is just a block of `type="page"` whose
// `data` is `{ title, icon }`; content blocks carry their own payload in `data`.
// `pageId` is the denormalized nearest `type="page"` ancestor (null for a page
// at the tree root).
export const BlockSchema = z.object({
  id: z.string(),
  pageId: z.string().nullable(),
  parentId: z.string().nullable(),
  type: z.string(),
  data: z.unknown(),
  rank: RankSchema,
  expanded: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Block = z.infer<typeof BlockSchema>;

// The reserved block type for a page node.
export const PAGE_BLOCK_TYPE = "page";

// The `data` payload of a `type="page"` block.
export const PageDataSchema = z.object({
  title: z.string(),
  icon: z.string().nullable(),
});
export type PageData = z.infer<typeof PageDataSchema>;

// Parse a page block's `data` into its typed `{ title, icon }`. Use on rows
// known to be `type="page"`.
export function pageData(block: Block): PageData {
  return PageDataSchema.parse(block.data);
}
