import type { PluginDefinition } from "@core";
import { Config } from "@plugins/config/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationCategoryConfig } from "../shared";
import { CategoryChipToolbar } from "./components/category-chip-toolbar";
import { CategoryColorSettings } from "./components/category-color-settings";
import { CategoryAvatarRow } from "./components/category-avatar-row";

export { autoColorKey } from "./internal/colors";
export type { ColorKey } from "./internal/colors";
export { useCategoryColors } from "./internal/use-category-colors";

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
    Config.Spec(conversationCategoryConfig),
    Config.Section({
      id: "category-colors",
      title: "Category avatars",
      description:
        "Click an avatar to pick its icon and color. The avatar appears in the conversation list. Leave unchanged for automatic coloring.",
      component: CategoryColorSettings,
    }),
    Item.Avatar({
      match: (conv) => conv.kind !== "agent",
      component: CategoryAvatarRow,
    }),
  ],
} satisfies PluginDefinition;
