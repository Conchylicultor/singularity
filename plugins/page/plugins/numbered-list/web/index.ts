import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { numberedListBlock } from "../core";

export { numberedListBlock } from "../core";

export default {
  description: "Numbered-list block type for the page editor.",
  contributions: [
    Editor.Block({
      id: numberedListBlock.type,
      match: numberedListBlock.type,
      block: numberedListBlock,
    }),
  ],
} satisfies PluginDefinition;
