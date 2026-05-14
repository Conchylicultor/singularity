import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { PushAndExitButton } from "./components/push-and-exit-button";

export default {
  id: "conversation-push-and-exit",
  name: "Conversation: Push & Exit",
  description:
    "Toolbar button that asks Claude to push the branch and close the conversation; surfaces Claude's flag if it has anything to raise.",
  contributions: [Conversation.PromptBar({ id: "push-and-exit", component: PushAndExitButton, section: "Exit", sectionOrder: 2 })],
} satisfies PluginDefinition;
