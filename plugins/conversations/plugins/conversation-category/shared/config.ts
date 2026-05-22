import { defineConfig } from "@plugins/config_v2/core";
import { boolField, textField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";
import { avatarField } from "@plugins/config_v2/plugins/fields/plugins/avatar/core";

export const conversationCategoryConfig = defineConfig({
  fields: {
    autoClassify: boolField({
      default: true,
      label: "Auto-classify with Haiku",
      description:
        "Automatically classify conversations into categories after each assistant turn. Manual re-classify is always available from the toolbar chip.",
    }),
    categories: listField({
      label: "Conversation categories",
      description:
        "Labels Haiku can pick from when classifying a conversation. Reorder freely; the last label is also the fallback when Haiku's reply doesn't match any entry, so a catch-all (e.g. \"Other\") at the end is recommended.",
      itemFields: {
        name: textField({ label: "Name" }),
        avatar: avatarField({ label: "Avatar" }),
      },
      default: [],
    }),
  },
});
