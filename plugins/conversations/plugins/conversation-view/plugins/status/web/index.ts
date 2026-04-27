import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { StatusBadge } from "./components/status-badge";

export default {
  id: "conversation-status",
  name: "Conversation: Status",
  description: "Displays the conversation status as a colored badge in the toolbar.",
  contributions: [
    conversationPane.Actions({ component: StatusBadge, position: "left" }),
  ],
} satisfies PluginDefinition;
