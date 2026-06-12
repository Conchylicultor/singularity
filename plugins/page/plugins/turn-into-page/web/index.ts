import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { TurnIntoPageItem } from "./components/turn-into-page-item";

export default {
  description:
    "Turn into → Page block action: collapse a block and its subtree into a new sub-page, leaving a clickable link in place.",
  contributions: [Editor.TurnInto({ id: "page", component: TurnIntoPageItem })],
} satisfies PluginDefinition;
