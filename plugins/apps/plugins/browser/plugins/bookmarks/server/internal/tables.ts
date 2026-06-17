import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// `browser_bookmarks`: one row per bookmarked URL, ordered by createdAt asc in
// the bookmarks bar. A plain table (not an entity extension) — bookmarks have
// no parent entity to hang off.
export const _browserBookmarks = pgTable("browser_bookmarks", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
