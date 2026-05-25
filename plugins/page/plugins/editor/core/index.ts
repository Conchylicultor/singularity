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
  CreateDocumentBodySchema,
  UpdateDocumentBodySchema,
  CreateBlockBodySchema,
  UpdateBlockBodySchema,
  MoveBlockBodySchema,
  SplitBlockBodySchema,
} from "./endpoints";
export type {
  CreateDocumentBody,
  UpdateDocumentBody,
  CreateBlockBody,
  UpdateBlockBody,
  MoveBlockBody,
  SplitBlockBody,
} from "./endpoints";
