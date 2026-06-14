import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ExitMenu } from "@plugins/conversations/plugins/conversation-view/plugins/exit-menu/web";
import { HoldAndExitItem } from "./components/hold-and-exit-button";

export default {
  description:
    "Exit-menu entry that marks the task as held and closes the conversation.",
  contributions: [ExitMenu.Item({ id: "hold-and-exit", component: HoldAndExitItem })],
} satisfies PluginDefinition;
