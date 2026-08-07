import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { Item } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { conversationCategoryConfig } from "../shared";
import { CategoryChipToolbar } from "./components/category-chip-toolbar";
import { CategoryAvatarRow } from "./components/category-avatar-row";
import { useCategoryOptions } from "./internal/use-category-options";

export { autoColorKey } from "./internal/colors";
export type { ColorKey } from "./internal/colors";
export {
  useCategories,
  useAvatarCategoryId,
  useCategoryAvatars,
} from "./internal/use-categories";
export type { Category, CategoryItem } from "./internal/use-categories";

export default {
  description:
    "Per-conversation categories: one chip per user-defined category in the conversation header, and the sidebar row avatar painted from the category chosen for it. Auto-classified by Haiku after each turn; manual override from each chip's popover.",
  contributions: [
    Conversation.Header({ id: "category", component: CategoryChipToolbar }),
    ConfigV2.WebRegister({ descriptor: conversationCategoryConfig }),
    // The "Avatar category" setting's options are the user's own categories, so
    // they can only be resolved at config-render time.
    DynamicEnum.Options({
      field: conversationCategoryConfig.fields.avatarCategory,
      useOptions: useCategoryOptions,
    }),
    Item.Avatar({
      match: ({ conv }) => conv.kind !== "agent",
      component: CategoryAvatarRow,
    }),
  ],
} satisfies PluginDefinition;
