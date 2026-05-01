import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { PushCounterButton } from "./components/push-counter-button";

export default {
  id: "conversation-push-counter",
  name: "Conversation: Push Counter",
  description: "Displays the number of pushes for the conversation's attempt in the toolbar.",
  contributions: [Conversation.ActionBar({ component: PushCounterButton })],
} satisfies PluginDefinition;
