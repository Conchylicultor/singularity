import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor, BlockTextRenderer } from "@plugins/page/plugins/editor/web";
import { bulletedListBlock } from "../core";

export { bulletedListBlock } from "../core";

export default {
  description: "Bulleted-list block type for the page editor.",
  contributions: [
    Editor.Block({
      match: bulletedListBlock.type,
      block: bulletedListBlock,
      component: BlockTextRenderer,
    }),
  ],
} satisfies PluginDefinition;
