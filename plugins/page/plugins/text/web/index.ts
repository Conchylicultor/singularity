import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { textBlock } from "../core";
import { TextBlock } from "./components/text-block";

export { textBlock } from "../core";

export default {
  name: "Text Block",
  description: "Plain-text block type for the page editor.",
  contributions: [
    Editor.Block({ match: textBlock.type, block: textBlock, component: TextBlock }),
  ],
} satisfies PluginDefinition;
