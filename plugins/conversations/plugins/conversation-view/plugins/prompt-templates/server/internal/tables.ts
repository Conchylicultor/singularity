import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/core";

export const promptTemplatesTable = pgTable("prompt_templates", {
  id:        text("id").primaryKey(),
  title:     text("title").notNull(),
  prompt:    text("prompt").notNull(),
  rank:      rankText("rank").notNull(),
  useCount:  integer("use_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
