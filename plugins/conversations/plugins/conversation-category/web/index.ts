import type { PluginDefinition } from "@core";
import { Config } from "@plugins/config/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationCategoryConfig } from "../shared";
import { CategoryChipRow } from "./components/category-chip-row";
import { CategoryChipToolbar } from "./components/category-chip-toolbar";

export default {
  id: "conversation-category",
  name: "Conversation: Category",
  description:
    "Per-conversation category chip in the sidebar row and conversation toolbar. Auto-classified by Haiku after each turn; manual override via the toolbar chip's popover.",
  contributions: [
    conversationPane.Actions({
      component: CategoryChipToolbar,
      position: "left",
    }),
    Item.Chips({ component: CategoryChipRow }),
    Config.Spec(conversationCategoryConfig),
  ],
} satisfies PluginDefinition;
