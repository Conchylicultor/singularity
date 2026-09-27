import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { ModelBadge } from "./components/model-badge";

export default {
  description:
    "Displays the conversation model as a colored chip in the toolbar.",
  contributions: [
    conversationPane.Actions({ id: "model", component: ModelBadge }),
  ],
} satisfies PluginDefinition;
