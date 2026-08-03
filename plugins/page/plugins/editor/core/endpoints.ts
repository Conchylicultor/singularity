import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { TrashOutcomeSchema } from "@plugins/infra/plugins/trash/core";
import { BlockSchema, PageRowSchema } from "./schemas";
import { BlockOpSchema } from "./block-ops";
import { BlockPatchSchema } from "./block-diff";

export const CreateBlockBodySchema = z.object({
  parentId: z.string().nullable().optional(),
  type: z.string(),
  data: z.unknown().optional(),
  /**
   * When set, position the new block immediately after this existing block —
   * same parent, rank between it and its next sibling. Overrides `parentId`.
   *
   * This is the ONLY positional mechanism: no caller may hand the server a rank.
   * `page_blocks` has one ordering space `(parent_id, rank)` that several live
   * resources project *disjointly* (the sidebar sees only `type='page'` rows,
   * the editor sees the rest), so a client minting a fractional key over the
   * rows it can see collides with the siblings it cannot. The server computes
   * every rank against the complete sibling set.
   */
  afterId: z.string().optional(),
});
export type CreateBlockBody = z.infer<typeof CreateBlockBodySchema>;

export const UpdateBlockBodySchema = z.object({
  type: z.string().optional(),
  data: z.unknown().optional(),
  expanded: z.boolean().optional(),
});
export type UpdateBlockBody = z.infer<typeof UpdateBlockBodySchema>;

/**
 * Positional intent, never a rank (see `CreateBlockBodySchema.afterId`). The
 * block lands among `parentId`'s children, immediately `zone` of `targetId`.
 *
 * The EDITOR surface no longer posts this for an ordinary drag — a same-page
 * move is a `BlockOp` on the ordered op stream. Two callers remain, and both are
 * writes no single page's optimistic overlay can predict: the Pages sidebar
 * (a different surface over the derived `docRank` order) and the composite
 * editor's CROSS-PAGE drop, which permutes two pages' forests at once.
 *
 * `targetId: null` addresses the sibling-list boundary instead of a neighbour:
 * `"after"` appends at the end of `parentId`'s children, `"before"` prepends at
 * the start. That is what a tree "drop onto this row as a child" gesture means.
 * A non-null `targetId` MUST already be a child of `parentId`.
 */
export const MoveBlockBodySchema = z.object({
  parentId: z.string().nullable(),
  targetId: z.string().nullable(),
  zone: z.enum(["before", "after"]),
});
export type MoveBlockBody = z.infer<typeof MoveBlockBodySchema>;

// Pages are blocks of `type="page"`, in document order per sidebar sibling group
// and carrying the derived `docRank` — the SAME shape and order as the `pages`
// live resource, because both are `loadPages()`. Deliberately not the plain rank
// sort it used to be: `rank` is only comparable within one `(parent_id, rank)`
// space, and a page's sidebar siblings can span several, so a second definition
// of "the pages list" here would be a second, wrong order for one concept.
export const listPages = defineEndpoint({
  route: "GET /api/pages",
  response: z.array(PageRowSchema),
});

// A page's content: non-page blocks scoped by `pageId`, ordered by rank.
export const listBlocks = defineEndpoint({
  route: "GET /api/pages/:pageId/blocks",
  response: z.array(BlockSchema),
});

// Which page an arbitrary block id opens: the row itself when it IS a page,
// its denormalized nearest page ancestor otherwise. `found: false` is the
// legitimate "there is no page to open" answer — an unknown id, a trashed row,
// or a page-less block at the forest root — NOT an error: every id-bearing
// surface outside the editor (a link written in a conversation, a stale
// bookmark) is allowed to name a block that is gone.
export const BlockPageSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(false) }),
  z.object({ found: z.literal(true), pageId: z.string(), isPage: z.boolean() }),
]);
export type BlockPage = z.infer<typeof BlockPageSchema>;

// The reverse lookup the `pages` resource cannot answer: it carries only
// `type="page"` rows, so a CONTENT block's id resolves to its page only here.
export const getBlockPage = defineEndpoint({
  route: "GET /api/blocks/:id/page",
  response: BlockPageSchema,
});

// Create any block. A top-level page = `{ parentId: null, type: "page", data:
// { title, icon } }`. The server computes `pageId` from the parent.
export const createBlock = defineEndpoint({
  route: "POST /api/blocks",
  body: CreateBlockBodySchema,
  response: BlockSchema,
});

export const updateBlock = defineEndpoint({
  route: "PATCH /api/blocks/:id",
  body: UpdateBlockBodySchema,
  response: BlockSchema,
});

// Delete a block subtree. The server's chokepoint decides whether that is a
// TRASH (any `type="page"` block in the cascade set — soft delete, restorable)
// or a genuine hard delete (a page-free subtree), and says which: a `trashed`
// outcome carries the ledger handle (`sourceId` + `entryId`) the caller needs to
// restore it, which is what makes the sidebar's delete undoable.
export const deleteBlock = defineEndpoint({
  route: "DELETE /api/blocks/:id",
  response: TrashOutcomeSchema,
});

export const moveBlock = defineEndpoint({
  route: "POST /api/blocks/:id/move",
  body: MoveBlockBodySchema,
  response: BlockSchema,
});

export const TurnIntoPageBodySchema = z.object({
  title: z.string(),
  /**
   * Type + data for the empty content block seeded when the target block has no
   * children (a page with zero children renders nothing typeable). Supplied by
   * the caller because the editor must not import a concrete block type — the
   * same seam as `CreateBlockBodySchema.type`.
   */
  seedChild: z.object({ type: z.string(), data: z.unknown().optional() }),
});
export type TurnIntoPageBody = z.infer<typeof TurnIntoPageBodySchema>;

// Turn an existing block into a sub-page **in place**: set `type="page"` and
// `data={title, icon:null}`, seed `seedChild` when it had no children, and
// recompute `pageId` across the new page boundary for its whole subtree. The
// page row *is* the inline link — no separate `page-link` row is created.
export const turnIntoPage = defineEndpoint({
  route: "POST /api/blocks/:id/turn-into-page",
  body: TurnIntoPageBodySchema,
  response: BlockSchema,
});

// Single authoritative structural edit: load the page's blocks, apply the pure
// `applyBlockOp` reducer, reconcile + persist the diff, and return the resulting
// block list. Replaces the per-keystroke split/merge/indent/outdent endpoints.
export const applyBlockOpEndpoint = defineEndpoint({
  route: "POST /api/pages/:pageId/blocks/op",
  body: BlockOpSchema,
  // `watermark` is the commit's ack token (`currentTxId` read inside the write
  // transaction) — the optimistic overlay uses it for causal confirmation.
  response: z.object({ blocks: z.array(BlockSchema), watermark: z.string() }),
});

// Generic minimal-change patch: upsert the given full rows (insert-or-update by
// id) and delete the given ids, all in one transaction. Used by undo/redo to
// re-apply minimal forward/reverse changes onto the CURRENT document state (the
// command-pattern inverse path), so undoing an old action never clobbers later
// unrelated edits. The forward user actions keep their own specific endpoints.
export const patchBlocks = defineEndpoint({
  route: "POST /api/pages/:pageId/blocks/patch",
  body: BlockPatchSchema,
  response: z.object({ blocks: z.array(BlockSchema), watermark: z.string() }),
});
