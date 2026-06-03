import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { StatusBadge } from "./components/status-badge";

export default {
  name: "Conversation: Status",
  description: "Displays the conversation status as a colored badge in the toolbar.",
  contributions: [
    Conversation.Header({ id: "status", component: StatusBadge }),
  ],
} satisfies PluginDefinition;
