import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { HoldAndExitButton } from "./components/hold-and-exit-button";

export default {
  id: "conversation-hold-and-exit",
  name: "Conversation: Hold & Exit",
  description:
    "Toolbar button that marks the task as held and closes the conversation.",
  contributions: [Conversation.Toolbar({ component: HoldAndExitButton, group: "floating" })],
} satisfies PluginDefinition;
