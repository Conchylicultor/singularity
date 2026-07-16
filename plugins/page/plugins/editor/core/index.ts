export { BlockSchema, PageRowSchema, PageDataSchema, PageCoverSchema, SvgNodeSchema, PAGE_BLOCK_TYPE, PAGES_TRASH_SOURCE, pageData, pageBlockHandle } from "./schemas";
export type { Block, PageRow, PageData, PageCover, BlockData } from "./schemas";

export { pagesResource, blocksResource } from "./resources";

export {
  listPages,
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  turnIntoPage,
  applyBlockOpEndpoint,
  patchBlocks,
  bulkDeleteBlocks,
  bulkMoveBlocks,
  bulkDuplicateBlocks,
  pasteBlocks,
  CreateBlockBodySchema,
  UpdateBlockBodySchema,
  MoveBlockBodySchema,
  TurnIntoPageBodySchema,
  BulkDeleteBlocksBodySchema,
  BulkMoveBlocksBodySchema,
  BulkDuplicateBlocksBodySchema,
  PasteBlocksBodySchema,
} from "./endpoints";
export type {
  CreateBlockBody,
  UpdateBlockBody,
  MoveBlockBody,
  TurnIntoPageBody,
  BulkDeleteBlocksBody,
  BulkMoveBlocksBody,
  BulkDuplicateBlocksBody,
  PasteBlocksBody,
} from "./endpoints";

export {
  BlockOpSchema,
  applyBlockOp,
  canIndent,
  canOutdent,
  childrenOf,
  opBlockIds,
  prevVisibleLeaf,
  textOf,
  runsOfNode,
  withRuns,
} from "./block-ops";
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

export { $appendRuns, colorCssValue, runsToLexical, serializeBlockRuns, tokenOf } from "./runs-lexical";
export type { RunsTokenExtension } from "./runs-lexical";

export { runsToXmlText, xmlTextToRuns } from "./runs-yjs";
export type { RunsXmlTextOptions } from "./runs-yjs";

export { SerializedBlockSchema } from "./serialized-block";
export type { SerializedBlock } from "./serialized-block";

export { serializeSubtree, rankWindow, planForestInsert } from "./block-forest";

export { defineBlock } from "./define-block";
export type { BlockHandle, BlockTextVariant } from "./define-block";

export {
  serializeForestToMarkdown,
  parseMarkdownToForest,
  defaultTextHandle,
} from "./markdown";
export type { BlockMarkdown, MdSerializeCtx, MdParseCtx } from "./markdown";

export { textDataSchema, textBlockSchema } from "./text-data";
export type { TextData, TextBearingSchema } from "./text-data";
