import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { UnderlineButton } from "./components/underline-button";

export default {
  description: "Underline mark button for the page editor's selection toolbar.",
  contributions: [Editor.FormatAction({ id: "underline", component: UnderlineButton })],
} satisfies PluginDefinition;
