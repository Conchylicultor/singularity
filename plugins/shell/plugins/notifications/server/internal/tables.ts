import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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
    muted: boolean("muted").notNull().default(false),
    linkTo: text("link_to"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    dedupKey: text("dedup_key"),
    // Occurrences collapsed onto this row via dedupKey (1 on first insert,
    // bumped on every dedup hit). Lets a deduped/re-surfacing notification read
    // as "happened N times" instead of spawning N rows. See record-notification.
    count: integer("count").notNull().default(1),
    // Wall-clock of the most recent occurrence (every dedup hit refreshes it),
    // distinct from createdAt which marks when the row last *surfaced*. Drives
    // the "last seen 2m ago" display and the quiet-notification TTL sweep.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("notifications_dismissed_idx").on(t.dismissed),
    index("notifications_created_at_idx").on(t.createdAt),
    index("notifications_last_seen_at_idx").on(t.lastSeenAt),
    uniqueIndex("notifications_dedup_key_idx").on(t.dedupKey),
  ],
);
