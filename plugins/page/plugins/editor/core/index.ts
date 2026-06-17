export { BlockSchema, PageDataSchema, PageCoverSchema, SvgNodeSchema, PAGE_BLOCK_TYPE, pageData } from "./schemas";
export type { Block, PageData, PageCover } from "./schemas";

export { pagesResource, blocksResource } from "./resources";

export {
  listPages,
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  applyBlockOpEndpoint,
  patchBlocks,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  bulkDuplicateBlocks,
  pasteBlocks,
  CreateBlockBodySchema,
  UpdateBlockBodySchema,
  MoveBlockBodySchema,
  BulkDeleteBlocksBodySchema,
  BulkMoveBlocksBodySchema,
  BulkDuplicateBlocksBodySchema,
  PasteBlocksBodySchema,
} from "./endpoints";
export type {
  CreateBlockBody,
  UpdateBlockBody,
  MoveBlockBody,
  BulkDeleteBlocksBody,
  BulkMoveBlocksBody,
  BulkDuplicateBlocksBody,
  PasteBlocksBody,
} from "./endpoints";

export { BlockOpSchema, applyBlockOp, childrenOf, prevVisibleLeaf, textOf, runsOfNode, withRuns } from "./block-ops";
export type { BlockOp, BlockNode } from "./block-ops";

export {
  BlockPatchSchema,
  diffBlocks,
  patchesFromDiff,
  isEmptyPatch,
} from "./block-diff";
export type { BlockPatch, BlockDiff } from "./block-diff";

export {
  MARK_ORDER,
  COLOR_TOKENS,
  sortMarks,
  runsOf,
  plainOf,
  runsLength,
  splitRuns,
  mergeRuns,
  coalesce,
  TextRunSchema,
  RichTextSchema,
} from "./rich-text";
export type { Mark, ColorToken, TextRun, RichText } from "./rich-text";

export { SerializedBlockSchema } from "./serialized-block";
export type { SerializedBlock } from "./serialized-block";

export { defineBlock } from "./define-block";
export type { BlockHandle, BlockTextVariant } from "./define-block";

export { textDataSchema, textBlockSchema } from "./text-data";
export type { TextData } from "./text-data";
