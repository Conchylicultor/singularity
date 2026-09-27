import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { StatusBadge } from "./components/status-badge";

export default {
  description:
    "Displays the conversation status as a colored badge in the toolbar.",
  contributions: [
    conversationPane.Actions({ id: "status", component: StatusBadge }),
  ],
} satisfies PluginDefinition;
