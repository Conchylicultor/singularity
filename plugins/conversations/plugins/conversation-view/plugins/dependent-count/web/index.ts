import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { DependentCountItemChip } from "./components/dependent-count-item-chip";

export default {
  description:
    'Per-row "N blocked" chip on a conversation item: how many tasks are transitively blocked by that conversation\'s task. The conversation toolbar shows the same count inside its Tasks button instead of as a chip of its own.',
  contributions: [
    Item.Chips({ id: "dependent-count", component: DependentCountItemChip }),
  ],
} satisfies PluginDefinition;
