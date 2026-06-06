import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { DocumentSchema, BlockSchema } from "./schemas";
import { SerializedBlockSchema } from "./serialized-block";

export const CreateDocumentBodySchema = z.object({
  title: z.string().optional(),
  parentId: z.string().nullable().optional(),
  rank: RankSchema.optional(),
  icon: z.string().nullable().optional(),
});
export type CreateDocumentBody = z.infer<typeof CreateDocumentBodySchema>;

export const UpdateDocumentBodySchema = z.object({
  title: z.string().optional(),
  parentId: z.string().nullable().optional(),
  rank: RankSchema.optional(),
  expanded: z.boolean().optional(),
  icon: z.string().nullable().optional(),
});
export type UpdateDocumentBody = z.infer<typeof UpdateDocumentBodySchema>;

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

export const SplitBlockBodySchema = z.object({
  position: z.number().int().nonnegative(),
  asChild: z.boolean().optional(),
  childType: z.string().optional(),
});
export type SplitBlockBody = z.infer<typeof SplitBlockBodySchema>;

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
  /** Target parent; null = document top level. Ignored when `afterId` is set. */
  parentId: z.string().nullable().optional(),
});
export type PasteBlocksBody = z.infer<typeof PasteBlocksBodySchema>;

export const listDocuments = defineEndpoint({
  route: "GET /api/documents",
  response: z.array(DocumentSchema),
});

export const createDocument = defineEndpoint({
  route: "POST /api/documents",
  body: CreateDocumentBodySchema,
  response: DocumentSchema,
});

export const getDocument = defineEndpoint({
  route: "GET /api/documents/:id",
  response: DocumentSchema,
});

export const updateDocument = defineEndpoint({
  route: "PATCH /api/documents/:id",
  body: UpdateDocumentBodySchema,
  response: DocumentSchema,
});

export const deleteDocument = defineEndpoint({
  route: "DELETE /api/documents/:id",
});

export const listBlocks = defineEndpoint({
  route: "GET /api/documents/:documentId/blocks",
  response: z.array(BlockSchema),
});

export const createBlock = defineEndpoint({
  route: "POST /api/documents/:documentId/blocks",
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

export const splitBlock = defineEndpoint({
  route: "POST /api/blocks/:id/split",
  body: SplitBlockBodySchema,
  response: z.object({ original: BlockSchema, created: BlockSchema }),
});

export const mergeBlocks = defineEndpoint({
  route: "POST /api/blocks/:id/merge",
  response: BlockSchema,
});

export const indentBlock = defineEndpoint({
  route: "POST /api/blocks/:id/indent",
  response: BlockSchema,
});

export const outdentBlock = defineEndpoint({
  route: "POST /api/blocks/:id/outdent",
  response: BlockSchema,
});

export const bulkDeleteBlocks = defineEndpoint({
  route: "POST /api/documents/:documentId/blocks/bulk-delete",
  body: BulkDeleteBlocksBodySchema,
  response: z.object({ deleted: z.number() }),
});

export const bulkMoveBlocks = defineEndpoint({
  route: "POST /api/documents/:documentId/blocks/bulk-move",
  body: BulkMoveBlocksBodySchema,
  response: z.array(BlockSchema),
});

export const bulkDuplicateBlocks = defineEndpoint({
  route: "POST /api/documents/:documentId/blocks/bulk-duplicate",
  body: BulkDuplicateBlocksBodySchema,
  response: z.object({ rootIds: z.array(z.string()) }),
});

export const pasteBlocks = defineEndpoint({
  route: "POST /api/documents/:documentId/blocks/paste",
  body: PasteBlocksBodySchema,
  response: z.object({ rootIds: z.array(z.string()) }),
});
