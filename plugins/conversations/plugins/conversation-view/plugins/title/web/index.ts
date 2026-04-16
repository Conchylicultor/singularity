import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { ConversationTitle } from "./components/conversation-title";

const titlePlugin: PluginDefinition = {
  id: "conversation-title",
  name: "Conversation: Title",
  description:
    "Clickable conversation title that opens a popover to create a child task under the conversation's parent task.",
  contributions: [
    Conversation.Title({
      component: ConversationTitle,
    }),
  ],
};

export default titlePlugin;
