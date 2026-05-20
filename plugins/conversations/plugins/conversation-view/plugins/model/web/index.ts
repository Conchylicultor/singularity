import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { ModelBadge } from "./components/model-badge";

export default {
  id: "conversation-model",
  name: "Conversation: Model",
  description:
    "Displays the conversation model as a colored chip in the toolbar.",
  contributions: [
    Conversation.Header({ id: "model", component: ModelBadge }),
  ],
} satisfies PluginDefinition;
