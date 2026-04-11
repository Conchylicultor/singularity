import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { conversationPane } from "./views";

const conversationPlugin: PluginDefinition = {
  id: "conversation",
  name: "Conversation",
  contributions: [
    Shell.Route({
      pattern: "/c/:id",
      resolve: (params) => conversationPane({ session_id: params.id! }),
    }),
  ],
};

export default conversationPlugin;
