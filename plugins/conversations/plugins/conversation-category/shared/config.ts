import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { avatarField } from "@plugins/fields/plugins/avatar/plugins/config/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";

export const conversationCategoryConfig = defineConfig({
  fields: {
    autoClassify: boolField({
      default: true,
      label: "Auto-classify with Haiku",
      description:
        "Automatically classify conversations after each assistant turn, one item per category. Manual re-classify is always available from the category chips in the conversation header.",
    }),
    // Value is a category id (see `categories` below). The option list is not
    // known at declaration time — it is the user's own categories — so it is
    // resolved at render time through the `DynamicEnum.Options` contribution in
    // this plugin's web barrel.
    avatarCategory: dynamicEnumField({
      label: "Avatar category",
      description:
        "Which category paints the avatar on sidebar conversation rows. Only one category can, so two categories never fight over the same disc. The commits-by-category charts in Stats break down by every category, independently of this choice.",
      display: "dropdown",
    }),
    categories: listField({
      label: "Categories",
      description:
        'One entry per axis you want conversations classified along — e.g. "Priority" with items P0/P1/P2, or "App" with one item per app. Each category is classified independently. A category with no items is skipped.',
      // Category ids are DURABLE KEYS: every classification row in the database
      // stores the id of the category it belongs to, and `avatarCategory` names
      // one. So ids must never be re-derived from content or position — hence
      // stable identity, enforced for this (top-level) list by the
      // `config-stable-list-ids` check.
      stableIdentity: true,
      itemFields: {
        name: textField({ label: "Name", placeholder: "Priority" }),
        hint: textField({
          label: "Hint",
          description:
            "Optional guidance passed to the classifier about what this category means as a whole. A good place to say what to do when nothing fits — e.g. \"if unsure, pick Other\".",
        }),
        items: listField({
          label: "Items",
          description:
            "The values this category can take. Every item row needs its own id — rows added here get one automatically.",
          itemFields: {
            name: textField({ label: "Name", placeholder: "P0" }),
            hint: textField({
              label: "Hint",
              placeholder: "Only use this if it impacts user revenue",
            }),
            avatar: avatarField({ label: "Avatar" }),
          },
          default: [],
        }),
      },
      default: [],
    }),
  },
});
