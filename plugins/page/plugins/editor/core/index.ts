export { BlockSchema, PageDataSchema, PAGE_BLOCK_TYPE, pageData } from "./schemas";
export type { Block, PageData } from "./schemas";

export { pagesResource, blocksResource } from "./resources";

export {
  listPages,
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
