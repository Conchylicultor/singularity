import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { LinkButton } from "./components/link-button";
import "./internal/register";

export default {
  description:
    "Inline links in the page editor: the selection toolbar's link control (⌘K), and a hover card under any link showing its URL with Copy and Edit (URL + title, Remove link).",
  contributions: [Editor.FormatAction({ id: "link", component: LinkButton })],
} satisfies PluginDefinition;
