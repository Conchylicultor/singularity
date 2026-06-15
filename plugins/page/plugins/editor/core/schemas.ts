import { z } from "zod";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";

// Recursive validator for the icon-picker SvgNode storage format. The `data`
// jsonb column stores the tree natively (no JSON-string wrapping), so a page
// can render its icon without importing the react-icons bundle. Exported so
// other page-domain surfaces that surface a page icon (e.g. the backlinks
// index) validate it the same way.
export const SvgNodeSchema: z.ZodType<SvgNode> = z.lazy(() =>
  z.object({
    tag: z.string(),
    attr: z.record(z.string()),
    child: z.array(SvgNodeSchema),
  }),
);

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

// A page cover: either an uploaded image (stored as an attachment id + a
// vertical reposition offset, applied as object-position Y%) or a preset
// gradient (stored as a frozen preset id, resolved to CSS client-side). The
// discriminated `type` keeps the two variants exclusive.
export const PageCoverSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("image"),
    attachmentId: z.string(),
    positionY: z.number().min(0).max(100).default(50),
  }),
  z.object({ type: z.literal("gradient"), preset: z.string() }),
]);
export type PageCover = z.infer<typeof PageCoverSchema>;

// The `data` payload of a `type="page"` block. `icon` is the Material Design
// icon key (e.g. "rocket"); `iconSvgNodes` is its extracted SVG tree, rendered
// directly so display surfaces don't ship the icon registry. Both null = no
// icon (a default glyph is shown instead). `cover` is the optional page cover
// (absent on legacy rows — decodes to `undefined`, no data migration).
export const PageDataSchema = z.object({
  title: z.string(),
  icon: z.string().nullable(),
  iconSvgNodes: z.array(SvgNodeSchema).nullable().optional(),
  cover: PageCoverSchema.nullable().optional(),
});
export type PageData = z.infer<typeof PageDataSchema>;

// Parse a page block's `data` into its typed `{ title, icon }`. Use on rows
// known to be `type="page"`.
export function pageData(block: Block): PageData {
  return PageDataSchema.parse(block.data);
}
