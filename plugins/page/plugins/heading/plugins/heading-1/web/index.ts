import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor, BlockTextRenderer } from "@plugins/page/plugins/editor/web";
import { heading1Block } from "../core";

export { heading1Block } from "../core";

export default {
  description: "Heading 1 block type for the page editor.",
  contributions: [
    Editor.Block({ id: heading1Block.type, match: heading1Block.type, block: heading1Block, component: BlockTextRenderer }),
  ],
} satisfies PluginDefinition;
