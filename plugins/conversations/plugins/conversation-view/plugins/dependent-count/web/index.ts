import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { DependentCountChip } from "./components/dependent-count-chip";

export default {
  description:
    "Shows the count of tasks transitively blocked by the current conversation's task.",
  contributions: [
    Conversation.ActionBar({ id: "dependent-count", component: DependentCountChip }),
  ],
} satisfies PluginDefinition;
