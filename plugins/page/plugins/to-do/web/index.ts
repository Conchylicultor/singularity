import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor, BlockTextRenderer } from "@plugins/page/plugins/editor/web";
import { toDoBlock } from "../core";

export { toDoBlock } from "../core";

export default {
  description: "To-do / checkbox block type for the page editor.",
  contributions: [
    Editor.Block({
      id: toDoBlock.type,
      match: toDoBlock.type,
      block: toDoBlock,
      component: BlockTextRenderer,
    }),
  ],
} satisfies PluginDefinition;
