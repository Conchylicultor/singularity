import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { conversationPane } from "./views";

const conversationPlugin: PluginDefinition = {
  id: "conversation",
  name: "Conversation",
  description: "Conversation pane and toolbar host; nested plugins extend `Conversation.Toolbar`.",
  contributions: [
    Shell.Route({
      pattern: "/c/:id",
      resolve: (params) => conversationPane({ session_id: params.id! }),
    }),
  ],
};

export default conversationPlugin;
