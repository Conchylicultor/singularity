import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { PrepromptChip } from "./components/preprompt-chip";

export { useConversationPreprompt } from "./internal/hooks";

export default {
  name: "Conversation: Preprompt",
  description:
    "Header chip showing the preprompt the conversation's task was launched with; a popover reveals the full instruction text.",
  contributions: [
    Conversation.Header({ id: "preprompt", component: PrepromptChip }),
  ],
} satisfies PluginDefinition;
