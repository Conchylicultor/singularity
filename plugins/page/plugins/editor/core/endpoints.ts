import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { DocumentSchema, BlockSchema } from "./schemas";

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
});
export type SplitBlockBody = z.infer<typeof SplitBlockBodySchema>;

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
