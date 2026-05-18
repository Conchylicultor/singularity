import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/core";

export const reviewSectionsTable = pgTable("review_sections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  patterns: jsonb("patterns").$type<string[]>().notNull().default([]),
  rank: rankText("rank").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
