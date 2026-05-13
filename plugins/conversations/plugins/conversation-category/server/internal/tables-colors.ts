import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Stores per-category avatar overrides. One row per category that has a
// manual override; categories without a row use the auto-assigned palette.
export const _conversationCategoryColors = pgTable(
  "conversation_category_colors",
  {
    category: text("category").primaryKey(),
    colorKey: text("color_key"),
    iconKey: text("icon_key"),
    iconSvgNodes: text("icon_svg_nodes"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);
