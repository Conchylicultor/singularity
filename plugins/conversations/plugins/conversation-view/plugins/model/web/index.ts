import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { ModelBadge } from "./components/model-badge";

export default {
  id: "conversation-model",
  name: "Conversation: Model",
  description:
    "Displays the conversation model as a colored chip in the toolbar.",
  contributions: [
    conversationPane.Actions({ component: ModelBadge, position: "left" }),
  ],
} satisfies PluginDefinition;
