import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BootSnapshot } from "@plugins/infra/plugins/boot-snapshot/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationCategoryConfig, conversationCategoriesResource } from "../shared";
import { CategoryChipToolbar } from "./components/category-chip-toolbar";
import { CategoryAvatarRow } from "./components/category-avatar-row";

export { autoColorKey } from "./internal/colors";
export type { ColorKey } from "./internal/colors";
export { useCategoryAvatars } from "./internal/use-category-avatars";

export default {
  description:
    "Per-conversation category chip in the sidebar row and conversation toolbar. Auto-classified by Haiku after each turn; manual override via the toolbar chip's popover.",
  contributions: [
    Conversation.Header({ id: "category", component: CategoryChipToolbar }),
    ConfigV2.WebRegister({ descriptor: conversationCategoryConfig }),
    Item.Avatar({
      match: ({ conv }) => conv.kind !== "agent",
      component: CategoryAvatarRow,
    }),
    BootSnapshot.Hydrate({ descriptor: conversationCategoriesResource }),
  ],
} satisfies PluginDefinition;
