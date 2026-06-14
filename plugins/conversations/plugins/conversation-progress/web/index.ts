import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BootSnapshot } from "@plugins/infra/plugins/boot-snapshot/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationProgressResource } from "../shared/schemas";
import { ProgressBarToolbar } from "./components/progress-bar-toolbar";
import { ProgressBarRow } from "./components/progress-bar-row";

export default {
  description:
    "4-step progress bar (research → plan → implementation → pushed) in the conversation toolbar and sidebar chip.",
  contributions: [
    Conversation.Header({ id: "progress", component: ProgressBarToolbar }),
    Item.Chips({ id: "progress", component: ProgressBarRow }),
    BootSnapshot.Hydrate({ descriptor: conversationProgressResource }),
  ],
} satisfies PluginDefinition;
