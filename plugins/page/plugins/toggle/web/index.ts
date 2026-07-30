import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { toggleBlock } from "../core";

export { toggleBlock } from "../core";

export default {
  description: "Toggle (collapsible) block type for the page editor.",
  contributions: [
    Editor.Block({
      id: toggleBlock.type,
      match: toggleBlock.type,
      block: toggleBlock,
    }),
  ],
} satisfies PluginDefinition;
