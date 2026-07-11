import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor, BlockTextRenderer } from "@plugins/page/plugins/editor/web";
import { heading2Block } from "../core";

export { heading2Block } from "../core";

export default {
  description: "Heading 2 block type for the page editor.",
  contributions: [
    Editor.Block({ id: heading2Block.type, match: heading2Block.type, block: heading2Block, component: BlockTextRenderer }),
  ],
} satisfies PluginDefinition;
