import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { ColorButton } from "./components/color-button";

export default {
  description: "Inline text-color control for the page editor's selection toolbar.",
  contributions: [Editor.FormatAction({ id: "color", component: ColorButton })],
} satisfies PluginDefinition;
