import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Stores per-category color overrides. One row per category that has a
// manual color; categories without a row use the auto-assigned palette color.
export const _conversationCategoryColors = pgTable(
  "conversation_category_colors",
  {
    category: text("category").primaryKey(),
    colorKey: text("color_key").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);
