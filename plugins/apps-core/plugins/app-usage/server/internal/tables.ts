import {
  bigint,
  date,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Per-app usage, one row per (local day, app). Every count is additive: the
 * flush upsert adds a delta, so any range of days is a plain sum.
 *
 * A plain `pgTable`: the apps are registry entries with no DB row to hang an
 * extension off. The single-column `usage_key` (`${day}:${appId}`) is the
 * upsert's conflict target.
 *
 * `last_flushed_at` is when a flush last added to the row — the retention
 * column: a day's row stops changing once the day is over, so "not added to
 * for two years" is "two years old".
 */
export const _appUsageDaily = pgTable("app_usage_daily", {
  usageKey: text("usage_key").primaryKey(),
  day: date("day", { mode: "string" }).notNull(),
  appId: text("app_id").notNull(),
  launches: integer("launches").notNull().default(0),
  focusedMs: bigint("focused_ms", { mode: "number" }).notNull().default(0),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  lastFlushedAt: timestamp("last_flushed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
