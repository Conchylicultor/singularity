import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor as EditorSlots } from "./slots";

export { Editor, useFramedBlockTypes, useBlockAnchors } from "./slots";
export type { BlockContribution, BlockFrameMeta } from "./slots";
export { MarkButton } from "./components/mark-button";
export type { MarkButtonProps } from "./components/mark-button";
export { useFormatToolbar } from "./internal/format-toolbar-context";
export type { FormatToolbarValue } from "./internal/format-toolbar-context";
export type {
  BlockAnchorProps,
  BlockChrome,
  BlockEditorAPI,
  BlockFrameProps,
  BlockRegion,
  BlockRegionProps,
  BlockRegions,
  BlockRendererProps,
} from "./types";
export { BlockEditor } from "./components/block-editor";
export type { BlockEditorHandle } from "./components/block-editor";
export type { CaretSurface, CaretSurfaceRef } from "./caret-surface";
export { caretFlightReportSink } from "./internal/caret-authority";
export type {
  CaretFlightAbortReason,
  CaretFlightAbortReport,
} from "./internal/caret-authority";
export { collabHydrationReportSink } from "./internal/hydration-report";
export type {
  CollabHydrationReason,
  CollabHydrationReport,
} from "./internal/hydration-report";
export { PageContentColumn } from "./components/page-content-column";
export {
  BLOCK_INSET,
  BLOCK_INDENT,
  MARKER_GUTTER,
} from "./internal/page-column";
export { BlockTextRenderer } from "./components/block-text-renderer";
// `BlockTextEditor` is deliberately NOT exported: a text-bearing block type
// never renders the editor itself, it declares `chrome` and lets the shared
// renderer place it. Removing the export deletes the roll-your-own-text-
// component affordance outright (prompt was its only external consumer).
export { TextBlockLayout } from "./components/text-block-layout";
export type { TextBlockLayoutProps } from "./components/text-block-layout";
export { useBlockEditor } from "./block-editor-context";
export {
  useInsertableBlocks,
  useGroupedInsertableBlocks,
  flattenSections,
  filterBlockTypes,
  BlockTypeList,
} from "./components/block-type-list";
export type { BlockSection } from "./components/block-type-list";
export {
  registerBlockTextExtension,
  getBlockTextExtensions,
  colorCssValue,
} from "./internal/block-text-extensions";
export { registerBlockPasteHandler } from "./internal/block-paste-handlers";
export type { BlockPasteHandler } from "./internal/block-paste-handlers";
export { OPEN_LINK_POPOVER_COMMAND } from "./internal/link-command";
export { isValidLinkUrl, normalizeLinkUrl } from "./internal/link-url";
export type {
  BlockTextExtension,
  BlockTextPluginProps,
} from "./internal/block-text-extensions";
export { usePageOptions, PageOptionsList } from "./components/page-options";
export type { PageOption, PageOptionsResult } from "./components/page-options";
export { PageIcon } from "./components/page-icon";
export type { PageIconProps } from "./components/page-icon";

export default {
  description: "Block-based document editor component and slot system.",
  slots: [EditorSlots],
} satisfies PluginDefinition;
