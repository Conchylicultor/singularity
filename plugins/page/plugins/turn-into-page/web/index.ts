import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { TurnIntoPageItem } from "./components/turn-into-page-item";

export default {
  description:
    "Turn into → Page block action: convert a block into a sub-page in place, keeping its id, position, and subtree; the page row renders inline as the link.",
  contributions: [Editor.TurnInto({ id: "page", component: TurnIntoPageItem })],
} satisfies PluginDefinition;
