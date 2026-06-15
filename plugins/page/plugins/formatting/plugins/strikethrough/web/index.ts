import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { StrikethroughButton } from "./components/strikethrough-button";

export default {
  description: "Strikethrough mark button for the page editor's selection toolbar.",
  contributions: [Editor.FormatAction({ id: "strikethrough", component: StrikethroughButton })],
} satisfies PluginDefinition;
