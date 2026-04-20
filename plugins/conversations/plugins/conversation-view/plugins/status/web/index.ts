import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { StatusBadge } from "./components/status-badge";

export default {
  id: "conversation-status",
  name: "Conversation: Status",
  description: "Displays the conversation status as a colored badge in the toolbar.",
  contributions: [
    Conversation.Toolbar({
      component: StatusBadge,
      group: "status",
    }),
  ],
} satisfies PluginDefinition;
