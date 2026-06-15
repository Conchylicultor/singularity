import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Editor } from "./slots";
export type { BlockContribution } from "./slots";
export { MarkButton } from "./components/mark-button";
export type { MarkButtonProps } from "./components/mark-button";
export { useFormatToolbar } from "./internal/format-toolbar-context";
export type { FormatToolbarValue } from "./internal/format-toolbar-context";
export type { BlockEditorAPI, BlockRendererProps } from "./types";
export { BlockEditor } from "./components/block-editor";
export { BLOCK_GUTTER } from "./components/block-row";
export { BlockTextRenderer } from "./components/block-text-renderer";
export { BlockTextEditor } from "./components/block-text-editor";
export { useBlockEditor } from "./block-editor-context";
export {
  useInsertableBlocks,
  filterBlockTypes,
  BlockTypeList,
} from "./components/block-type-list";
export { BlockTypeMenu } from "./components/block-type-menu";
export {
  registerBlockTextExtension,
  getBlockTextExtensions,
  colorCssValue,
} from "./internal/block-text-extensions";
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
  contributions: [],
} satisfies PluginDefinition;
