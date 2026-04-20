import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { conversationPane } from "./views";

export { Conversation } from "./slots";
export type { ConversationState } from "./slots";
export { Conversation as ConversationCommands } from "./commands";
export type { MiddlePaneDescriptor, RightPaneDescriptor, MainViewDescriptor } from "./commands";
export { useMiddlePane, useRightPane, useMainView, MiddlePaneContext, RightPaneContext, MainViewContext } from "./commands";
export { conversationPane } from "./views";
export { ConversationView } from "./components/conversation-view";

export default {
  id: "conversation",
  name: "Conversation",
  description: "Conversation pane and toolbar host; nested plugins extend `Conversation.Toolbar`.",
  contributions: [
    Shell.Route({
      pattern: "/c/:id",
      resolve: (params) => conversationPane({ session_id: params.id! }),
    }),
  ],
} satisfies PluginDefinition;
