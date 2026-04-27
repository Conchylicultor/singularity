import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { PushCounterButton } from "./components/push-counter-button";

export default {
  id: "conversation-push-counter",
  name: "Conversation: Push Counter",
  description: "Displays the number of pushes for the conversation's attempt in the toolbar.",
  contributions: [conversationPane.Actions({ component: PushCounterButton })],
} satisfies PluginDefinition;
