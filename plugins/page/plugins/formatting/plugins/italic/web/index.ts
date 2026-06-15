import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { ItalicButton } from "./components/italic-button";

export default {
  description: "Italic mark button for the page editor's selection toolbar.",
  contributions: [Editor.FormatAction({ id: "italic", component: ItalicButton })],
} satisfies PluginDefinition;
