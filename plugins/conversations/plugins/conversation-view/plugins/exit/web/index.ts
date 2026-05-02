import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { ExitButton } from "./components/exit-button";

export default {
  id: "conversation-exit",
  name: "Conversation: Exit",
  description: "Toolbar button that closes the conversation without changing any task state.",
  contributions: [Conversation.PromptBar({ id: "exit", component: ExitButton, section: "Exit", sectionOrder: 2 })],
} satisfies PluginDefinition;
