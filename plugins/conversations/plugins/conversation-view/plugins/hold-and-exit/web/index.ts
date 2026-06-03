import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { HoldAndExitButton } from "./components/hold-and-exit-button";

export default {
  name: "Conversation: Hold & Exit",
  description:
    "Toolbar button that marks the task as held and closes the conversation.",
  contributions: [Conversation.PromptBar({ id: "hold-and-exit", component: HoldAndExitButton, section: "Exit", sectionOrder: 2 })],
} satisfies PluginDefinition;
