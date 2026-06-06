export { DocumentSchema, BlockSchema } from "./schemas";
export type { Document, Block } from "./schemas";

export { documentsResource, blocksResource } from "./resources";

export {
  listDocuments,
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  splitBlock,
  mergeBlocks,
  indentBlock,
  outdentBlock,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  bulkDuplicateBlocks,
  pasteBlocks,
  CreateDocumentBodySchema,
  UpdateDocumentBodySchema,
  CreateBlockBodySchema,
  UpdateBlockBodySchema,
  MoveBlockBodySchema,
  SplitBlockBodySchema,
  BulkDeleteBlocksBodySchema,
  BulkMoveBlocksBodySchema,
  BulkDuplicateBlocksBodySchema,
  PasteBlocksBodySchema,
} from "./endpoints";
export type {
  CreateDocumentBody,
  UpdateDocumentBody,
  CreateBlockBody,
  UpdateBlockBody,
  MoveBlockBody,
  SplitBlockBody,
  BulkDeleteBlocksBody,
  BulkMoveBlocksBody,
  BulkDuplicateBlocksBody,
  PasteBlocksBody,
} from "./endpoints";

export { SerializedBlockSchema } from "./serialized-block";
export type { SerializedBlock } from "./serialized-block";

export { defineBlock } from "./define-block";
export type { BlockHandle } from "./define-block";

export { textDataSchema } from "./text-data";
export type { TextData } from "./text-data";
