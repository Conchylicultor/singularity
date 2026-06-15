import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { CodeButton } from "./components/code-button";

export default {
  description: "Inline-code mark button for the page editor's selection toolbar.",
  contributions: [Editor.FormatAction({ id: "code", component: CodeButton })],
} satisfies PluginDefinition;
