import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { idColumn } from "@plugins/ids/server";
import { browserVisitIdKind } from "../../core";

// One row per browser visit. Distinct-by-url recents are derived at read time.
export const browserHistory = pgTable("browser_history", {
  id: idColumn(browserVisitIdKind),
  url: text("url").notNull(),
  title: text("title").notNull(),
  visitedAt: timestamp("visited_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
