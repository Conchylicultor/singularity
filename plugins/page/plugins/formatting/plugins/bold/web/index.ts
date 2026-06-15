import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { BoldButton } from "./components/bold-button";

export default {
  description: "Bold mark button for the page editor's selection toolbar.",
  contributions: [Editor.FormatAction({ id: "bold", component: BoldButton })],
} satisfies PluginDefinition;
