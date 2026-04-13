import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { StatusBadge } from "./components/status-badge";

const statusPlugin: PluginDefinition = {
  id: "conversation-status",
  name: "Conversation: Status",
  description: "Displays the conversation status as a colored badge in the toolbar.",
  contributions: [
    Conversation.Toolbar({
      component: StatusBadge,
      group: "status",
    }),
  ],
};

export default statusPlugin;
