import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { ModelBadge } from "./components/model-badge";

export default {
  id: "conversation-model",
  name: "Conversation: Model",
  description:
    "Displays the conversation model as a colored chip in the toolbar.",
  contributions: [
    Conversation.Toolbar({
      component: ModelBadge,
      group: "status",
    }),
  ],
} satisfies PluginDefinition;
