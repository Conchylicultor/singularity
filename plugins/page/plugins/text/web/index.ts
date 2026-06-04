import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor, BlockTextRenderer } from "@plugins/page/plugins/editor/web";
import { textBlock } from "../core";

export { textBlock } from "../core";

export default {
  name: "Text Block",
  description: "Plain-text block type for the page editor.",
  contributions: [
    Editor.Block({ match: textBlock.type, block: textBlock, component: BlockTextRenderer }),
  ],
} satisfies PluginDefinition;
