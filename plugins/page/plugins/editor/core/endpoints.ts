import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { BlockSchema } from "./schemas";
import { BlockOpSchema } from "./block-ops";
import { BlockPatchSchema } from "./block-diff";
import { SerializedBlockSchema } from "./serialized-block";

export const CreateBlockBodySchema = z.object({
  parentId: z.string().nullable().optional(),
  type: z.string(),
  data: z.unknown().optional(),
  rank: RankSchema.optional(),
  /**
   * When set, position the new block immediately after this existing block —
   * same parent, rank between it and its next sibling. Overrides `parentId`.
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

export const MoveBlockBodySchema = z.object({
  parentId: z.string().nullable(),
  rank: RankSchema,
});
export type MoveBlockBody = z.infer<typeof MoveBlockBodySchema>;

export const BulkDeleteBlocksBodySchema = z.object({
  ids: z.array(z.string()),
});
export type BulkDeleteBlocksBody = z.infer<typeof BulkDeleteBlocksBodySchema>;

export const BulkMoveBlocksBodySchema = z.object({
  ids: z.array(z.string()),
  parentId: z.string().nullable(),
  /**
   * Insert the moved blocks immediately after this sibling (same parent), or at
   * the start of `parentId` when null. The server lays them out with sequential
   * ranks between `afterId` and the following sibling.
   */
  afterId: z.string().nullable(),
});
export type BulkMoveBlocksBody = z.infer<typeof BulkMoveBlocksBodySchema>;

export const BulkDuplicateBlocksBodySchema = z.object({
  ids: z.array(z.string()),
});
export type BulkDuplicateBlocksBody = z.infer<
  typeof BulkDuplicateBlocksBodySchema
>;

export const PasteBlocksBodySchema = z.object({
  blocks: z.array(SerializedBlockSchema),
  /** Insert after this block (same parent), or at the start of `parentId`. */
  afterId: z.string().nullable(),
  /** Target parent; null = page top level. Ignored when `afterId` is set. */
  parentId: z.string().nullable().optional(),
});
export type PasteBlocksBody = z.infer<typeof PasteBlocksBodySchema>;

// Pages are blocks of `type="page"`, ordered by rank (sidebar tree built by
// `parentId`).
export const listPages = defineEndpoint({
  route: "GET /api/pages",
  response: z.array(BlockSchema),
});

// A page's content: non-page blocks scoped by `pageId`, ordered by rank.
export const listBlocks = defineEndpoint({
  route: "GET /api/pages/:pageId/blocks",
  response: z.array(BlockSchema),
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

export const deleteBlock = defineEndpoint({
  route: "DELETE /api/blocks/:id",
});

export const moveBlock = defineEndpoint({
  route: "POST /api/blocks/:id/move",
  body: MoveBlockBodySchema,
  response: BlockSchema,
});

// Single authoritative structural edit: load the page's blocks, apply the pure
// `applyBlockOp` reducer, reconcile + persist the diff, and return the resulting
// block list. Replaces the per-keystroke split/merge/indent/outdent endpoints.
export const applyBlockOpEndpoint = defineEndpoint({
  route: "POST /api/pages/:pageId/blocks/op",
  body: BlockOpSchema,
  response: z.object({ blocks: z.array(BlockSchema) }),
});

// Generic minimal-change patch: upsert the given full rows (insert-or-update by
// id) and delete the given ids, all in one transaction. Used by undo/redo to
// re-apply minimal forward/reverse changes onto the CURRENT document state (the
// command-pattern inverse path), so undoing an old action never clobbers later
// unrelated edits. The forward user actions keep their own specific endpoints.
export const patchBlocks = defineEndpoint({
  route: "POST /api/pages/:pageId/blocks/patch",
  body: BlockPatchSchema,
  response: z.object({ blocks: z.array(BlockSchema) }),
});

export const bulkDeleteBlocks = defineEndpoint({
  route: "POST /api/pages/:pageId/blocks/bulk-delete",
  body: BulkDeleteBlocksBodySchema,
  response: z.object({ deleted: z.number() }),
});

export const bulkMoveBlocks = defineEndpoint({
  route: "POST /api/pages/:pageId/blocks/bulk-move",
  body: BulkMoveBlocksBodySchema,
  response: z.array(BlockSchema),
});

export const bulkDuplicateBlocks = defineEndpoint({
  route: "POST /api/pages/:pageId/blocks/bulk-duplicate",
  body: BulkDuplicateBlocksBodySchema,
  response: z.object({ rootIds: z.array(z.string()) }),
});

export const pasteBlocks = defineEndpoint({
  route: "POST /api/pages/:pageId/blocks/paste",
  body: PasteBlocksBodySchema,
  response: z.object({ rootIds: z.array(z.string()) }),
});
