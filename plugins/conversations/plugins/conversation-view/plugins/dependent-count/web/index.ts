import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { DependentCountChip } from "./components/dependent-count-chip";
import { DependentCountItemChip } from "./components/dependent-count-item-chip";

export default {
  description:
    "Shows the count of tasks transitively blocked by the current conversation's task.",
  contributions: [
    Conversation.ActionBar({ id: "dependent-count", component: DependentCountChip }),
    Item.Chips({ id: "dependent-count", component: DependentCountItemChip }),
  ],
} satisfies PluginDefinition;
