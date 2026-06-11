import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Editor } from "./slots";
export type { BlockContribution } from "./slots";
export type { BlockEditorAPI, BlockRendererProps } from "./types";
export { BlockEditor } from "./components/block-editor";
export { BlockTextRenderer } from "./components/block-text-renderer";
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
} from "./internal/block-text-extensions";
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
