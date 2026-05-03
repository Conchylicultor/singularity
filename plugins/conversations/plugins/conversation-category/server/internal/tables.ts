import { text } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const _conversationCategoryExt = defineExtension(_conversations, "category", {
  category: text("category").notNull(),
  source: text("source", { enum: ["haiku", "manual"] }).notNull(),
});
