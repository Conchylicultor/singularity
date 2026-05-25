import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const _tweakcnThemes = pgTable("tweakcn_themes", {
  id: text("id").primaryKey(),
  tweakcnId: text("tweakcn_id").notNull().unique(),
  label: text("label").notNull(),
  rawJson: jsonb("raw_json")
    .$type<Record<string, unknown>>()
    .notNull(),
  presets: jsonb("presets")
    .$type<
      Record<string, { light: Record<string, string>; dark: Record<string, string> }>
    >()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
