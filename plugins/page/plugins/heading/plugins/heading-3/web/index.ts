import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor, BlockTextRenderer } from "@plugins/page/plugins/editor/web";
import { heading3Block } from "../core";

export { heading3Block } from "../core";

export default {
  description: "Heading 3 block type for the page editor.",
  contributions: [
    Editor.Block({ id: heading3Block.type, match: heading3Block.type, block: heading3Block, component: BlockTextRenderer }),
  ],
} satisfies PluginDefinition;
