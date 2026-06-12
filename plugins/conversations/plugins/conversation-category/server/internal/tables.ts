import { text } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const conversationCategory = defineExtension(_conversations, "category", {
  category: text("category").notNull(),
  source: text("source", { enum: ["haiku", "manual"] }).notNull(),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationCategoryTable = conversationCategory.table;
