import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { DropAndExitButton } from "./components/drop-and-exit-button";

export default {
  id: "conversation-drop-and-exit",
  name: "Conversation: Drop & Exit",
  description:
    "Toolbar button that marks the top task as dropped and closes the conversation.",
  contributions: [Conversation.Toolbar({ component: DropAndExitButton })],
} satisfies PluginDefinition;
