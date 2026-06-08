import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ExitMenu } from "@plugins/conversations/plugins/conversation-view/plugins/exit-menu/web";
import { ExitItem } from "./components/exit-button";

export default {
  name: "Conversation: Exit",
  description: "Exit-menu entry that closes the conversation without changing any task state.",
  contributions: [ExitMenu.Item({ id: "exit", component: ExitItem, order: 1 })],
} satisfies PluginDefinition;
