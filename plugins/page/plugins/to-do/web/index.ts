import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor, BlockTextRenderer } from "@plugins/page/plugins/editor/web";
import { toDoBlock } from "../core";

export { toDoBlock } from "../core";

export default {
  name: "To-do Block",
  description: "To-do / checkbox block type for the page editor.",
  contributions: [
    Editor.Block({
      match: toDoBlock.type,
      block: toDoBlock,
      component: BlockTextRenderer,
    }),
  ],
} satisfies PluginDefinition;
