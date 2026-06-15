import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { LinkButton } from "./components/link-button";

export default {
  description: "Inline-link control for the page editor's selection toolbar.",
  contributions: [Editor.FormatAction({ id: "link", component: LinkButton })],
} satisfies PluginDefinition;
