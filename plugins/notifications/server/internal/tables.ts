import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const _notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    variant: text("variant").notNull(),
    dismissed: boolean("dismissed").notNull().default(false),
    read: boolean("read").notNull().default(false),
    linkTo: text("link_to"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("notifications_dismissed_idx").on(t.dismissed),
    index("notifications_created_at_idx").on(t.createdAt),
  ],
);
