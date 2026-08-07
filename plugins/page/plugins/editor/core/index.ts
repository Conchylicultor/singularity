export {
  BlockSchema,
  PageRowSchema,
  PageDataSchema,
  PageCoverSchema,
  SvgNodeSchema,
  PAGE_BLOCK_TYPE,
  PAGES_TRASH_SOURCE,
  pageData,
  pageBlockHandle,
  pageBlockMarkdown,
} from "./schemas";
export type { Block, PageRow, PageData, PageCover, BlockData } from "./schemas";

export { pagesResource, blocksResource } from "./resources";

export {
  listPages,
  listBlocks,
  getBlockPage,
  BlockPageSchema,
  createBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  turnIntoPage,
  applyBlockOpEndpoint,
  patchBlocks,
  CreateBlockBodySchema,
  UpdateBlockBodySchema,
  MoveBlockBodySchema,
  TurnIntoPageBodySchema,
} from "./endpoints";
export type {
  BlockPage,
  CreateBlockBody,
  UpdateBlockBody,
  MoveBlockBody,
  TurnIntoPageBody,
} from "./endpoints";

export {
  BlockOpSchema,
  applyBlockOp,
  canIndent,
  canOutdent,
  childrenOf,
  inDocumentOrder,
  opBlockIds,
  pasteAnchorId,
  prevVisibleLine,
  nextVisibleLine,
  visibleChildRule,
  visibleChildrenOf,
  collapsedAnchorAbove,
  textOf,
  runsOfNode,
  withRuns,
} from "./block-ops";
export type { BlockOp, BlockOpContext, BlockNode, IsAnchor } from "./block-ops";

export {
  BlockPatchSchema,
  BlockFieldChangesSchema,
  changedFields,
  dataEqual,
  namesField,
  diffBlocks,
  patchesFromDiff,
  isEmptyPatch,
} from "./block-diff";
export type {
  BlockPatch,
  BlockUpdate,
  BlockFieldChanges,
  BlockDiff,
} from "./block-diff";

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

export {
  INLINE_SYNTAXES,
  matchInlineFormat,
  parseInlineMarkdown,
  serializeInlineMarkdown,
} from "./inline-markdown";
export type {
  InlineSyntax,
  InlineFormatMatch,
  InlineFormatContext,
} from "./inline-markdown";

export {
  $appendRuns,
  colorCssValue,
  marksOfTextNode,
  runsToLexical,
  serializeBlockRuns,
  tokenOf,
} from "./runs-lexical";
export type { RunsTokenExtension } from "./runs-lexical";

export { runsToXmlText, xmlTextToRuns, xmlTextContentLength } from "./runs-yjs";
export type { RunsXmlTextOptions } from "./runs-yjs";

export {
  SerializedBlockSchema,
  IdentifiedBlockSchema,
  withMintedIds,
} from "./serialized-block";
export type { SerializedBlock, IdentifiedBlock } from "./serialized-block";

export { rankWindow, planForestInsert } from "./block-forest";

export { conversionPrefixesOf, defineBlock } from "./define-block";
export type {
  BlockAudience,
  BlockHandle,
  BlockTextVariant,
} from "./define-block";

export { rowDataOf } from "./row-data";
export type { RowData } from "./row-data";

export {
  serializeForestToMarkdown,
  parseMarkdownToForest,
  defaultTextHandle,
  markdownParseTagName,
  markdownTagIsIdentified,
} from "./markdown";
export type {
  BlockMarkdown,
  BlockTag,
  BlockTagBody,
  MarkdownContext,
  MarkdownNode,
  MdSerializeCtx,
  MdParseCtx,
} from "./markdown";

export { textDataSchema, textBlockSchema } from "./text-data";
export type { TextData, TextBearingSchema } from "./text-data";
