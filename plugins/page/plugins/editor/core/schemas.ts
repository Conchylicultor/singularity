import { z } from "zod";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { defineBlock } from "./define-block";

// A block `data` payload that has been validated against its block type's schema.
// Type-only brand (no runtime shape) — mintable ONLY by `parseBlockData()` on the
// server, its sole minting site. The `page_blocks.data` column is `$type<BlockData>`,
// so a write that did not pass through `parseBlockData` fails to compile. Readers are
// unaffected: `BlockData` is assignable to the `unknown` that `pageData()` /
// `BlockSchema.data` accept.
declare const blockDataBrand: unique symbol;
export type BlockData = Record<string, unknown> & {
  readonly [blockDataBrand]: never;
};

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

// The `infra/trash` source id this plugin registers (`defineTrashSource` in
// server/index.ts). It lives in `core/` — NOT privately on the server — because
// both sides name it: the server chokepoint stamps it onto every ledger row, and
// the web (the Pages Trash dialog, the undoable-delete seam) addresses
// `/api/trash/:sourceId/…` with it. One name per concept.
export const PAGES_TRASH_SOURCE = "pages";

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
// known to be `type="page"`. Only the `data` field is read, so any row-like
// value carrying `data` is accepted (raw DB selects, full Blocks, etc.).
export function pageData(block: Pick<Block, "data">): PageData {
  return PageDataSchema.parse(block.data);
}

// The block handle for the reserved `type="page"` node. Owned by `editor/core` —
// NOT by the `sub-page` renderer plugin — because `handle-turn-into-page` and
// `replacePageContent` write page rows directly, so page creation must not depend
// on the sub-page plugin being enabled. `editor/server` contributes THIS handle to
// the server `Editor.BlockData` registry; the `sub-page` web renderer reuses it
// directly rather than declaring a second handle for the same type — a `type` is
// defined, and registered, exactly once.
export const pageBlockHandle = defineBlock({
  type: PAGE_BLOCK_TYPE,
  schema: PageDataSchema,
});
