import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ExitMenu } from "@plugins/conversations/plugins/conversation-view/plugins/exit-menu/web";
import { DropAndExitItem } from "./components/drop-and-exit-button";

export default {
  name: "Conversation: Drop & Exit",
  description:
    "Exit-menu entry that marks the top task as dropped and closes the conversation.",
  contributions: [ExitMenu.Item({ id: "drop-and-exit", component: DropAndExitItem, order: 2 })],
} satisfies PluginDefinition;
