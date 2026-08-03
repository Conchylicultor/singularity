import { z } from "zod";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { defineBlock } from "./define-block";
import type { BlockMarkdown } from "./markdown";

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

// A page row as the `pages` resource emits it: a `type="page"` block plus
// `docRank` — a DERIVED, per-load ordering key.
//
// `rank` is the storage key: a fractional index comparable ONLY within its own
// `(parent_id, rank)` space. The sidebar's sibling group is "pages sharing a
// `pageId`", which can span SEVERAL such spaces (a sub-page may be a direct
// child of its page, or sit under a text line / toggle), so sorting those `rank`
// strings against each other is meaningless — and duplicates across spaces make
// the DnD rank arithmetic throw. `docRank` is a real fractional-index `Rank`
// minted by the loader, unique and ordered WITHIN one `pageId` group, derived
// from true document order (a rank-ordered DFS of the block forest).
//
// It is **never persisted and never written back**: no column, no migration, no
// request body. A `docRank` is only valid against the group it was minted with,
// and the SAME row read through `blocksResource` carries no `docRank` at all —
// writing one back would give one row two conflicting `rank` values. Moves send
// positional intent (an anchor id); the server mints the real `rank` against the
// complete sibling set.
export const PageRowSchema = BlockSchema.extend({ docRank: RankSchema });
export type PageRow = z.infer<typeof PageRowSchema>;

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

/**
 * The `page` row's markdown mapping, declared ONCE and shared by BOTH handles
 * that register the type — `pageBlockHandle` below (server `Editor.BlockData`)
 * and `sub-page`'s web renderer handle. A second copy would let the two disagree
 * about the tag name, and two handles claiming one tag name on PARSE is a loud
 * error.
 */
export const pageBlockMarkdown: BlockMarkdown<PageData> = {
  tag: {
    name: "page",
    // A sub-page's children live under a DIFFERENT `page_id` partition and are
    // mounted only while the row is expanded (`deriveMounts`), so a collapsed
    // page's children are not in the forest at all. Emitting `<page id="x"/>`
    // for it states that, and stops a future server-side walk from loading rows
    // the editing surface never had.
    body: "children-when-expanded",
    // A page's identity IS its row id, which no `data` field carries — this is
    // the one tag that reads `ctx.id`, and why the serialize walk takes
    // `MarkdownNode` rather than the id-less `SerializedBlock`.
    attrs: (_data, ctx) => {
      if (ctx.id === undefined) {
        throw new Error(
          "markdown: a `page` block can only be serialized from an IDENTIFIED forest — " +
            "its id is its identity, and an id-less <page/> could never be reconciled " +
            "against the row it came from.",
        );
      }
      return { id: ctx.id };
    },
    // SERIALIZE ONLY: `<page id="x"/>` parses back as a `page-link`, never as a
    // sub-page. **Markdown parse alone can never mint a sub-page** — minting one
    // means minting its `page_id` partition and restamping a subtree, which only
    // the server's turn-into-page op does (and neither handle declares a `label`,
    // so it cannot be menu-created either). The id in the tag is precisely what
    // lets a future diff/merge reconcile the tag against the EXISTING sub-page
    // row instead of re-minting it.
    serializeOnly: true,
  },
};

// The block handle for the reserved `type="page"` node. Owned by `editor/core` —
// NOT by the `sub-page` renderer plugin — because `handle-turn-into-page` and
// `replacePageContent` write page rows directly, so page creation must not depend
// on the sub-page plugin being enabled. `editor/server` contributes THIS handle to
// the server `Editor.BlockData` registry; the `sub-page` web renderer declares its
// own handle for the same type, sharing `pageBlockMarkdown` above.
export const pageBlockHandle = defineBlock({
  type: PAGE_BLOCK_TYPE,
  schema: PageDataSchema,
  markdown: pageBlockMarkdown,
});
