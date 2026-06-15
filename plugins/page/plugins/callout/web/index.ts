import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { calloutBlock } from "../core";
import { CalloutBlock } from "./components/callout-block";

export { calloutBlock } from "../core";

export default {
  description:
    "Callout block type: a tinted highlight box with a changeable leading icon and semantic color, for notes/tips/warnings.",
  contributions: [
    Editor.Block({ match: calloutBlock.type, block: calloutBlock, component: CalloutBlock }),
  ],
} satisfies PluginDefinition;
