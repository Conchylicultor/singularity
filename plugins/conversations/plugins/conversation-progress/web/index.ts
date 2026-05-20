import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { ProgressBarToolbar } from "./components/progress-bar-toolbar";
import { ProgressBarRow } from "./components/progress-bar-row";

export default {
  id: "conversation-progress",
  name: "Conversation: Progress",
  description:
    "4-step progress bar (research → plan → implementation → pushed) in the conversation toolbar and sidebar chip.",
  contributions: [
    Conversation.Header({ id: "progress", component: ProgressBarToolbar }),
    Item.Chips({ component: ProgressBarRow }),
  ],
} satisfies PluginDefinition;
