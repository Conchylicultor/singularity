import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/core";

export const launchPromptsTable = pgTable("launch_prompts", {
  id:        text("id").primaryKey(),
  title:     text("title").notNull(),
  prompt:    text("prompt").notNull(),
  model:     text("model").notNull(),
  rank:      rankText("rank").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
