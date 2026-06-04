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

export default {
  name: "Page Editor",
  description: "Block-based document editor component and slot system.",
  contributions: [],
} satisfies PluginDefinition;
