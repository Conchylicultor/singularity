import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { ModelBadge } from "./components/model-badge";

const modelPlugin: PluginDefinition = {
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
};

export default modelPlugin;
