import { z } from "zod";
import {
  date,
  index,
  integer,
  bigint,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  parsedJson,
  parsedText,
} from "@plugins/database/plugins/sql-column/server";
import {
  BrowserFamilySchema,
  ChannelSchema,
  DailyDimensionSchema,
  DeviceFamilySchema,
  FilterLevelSchema,
  OsFamilySchema,
} from "../../core";

/**
 * One random salt per UTC day. The visitor hash is `sha256(salt ‖ ip ‖ ua ‖
 * host)`; the nightly rollup deletes every salt before today, after which
 * yesterday's hashes can no longer be reproduced from anyone's IP.
 */
export const analyticsSalts = pgTable("analytics_salts", {
  day: date("day", { mode: "string" }).primaryKey(),
  /** 32 random bytes, hex. */
  salt: text("salt").notNull(),
});

/**
 * One visit: a run of activity from the same daily visitor hash with no gap of
 * 30 minutes or more. Kept 90 days (`retention.ts`); its hits cascade.
 *
 * Source attributes (referrer, campaign, device…) are set when the visit is
 * created and never change. `exit*`, `pageviews`, `events`, `engagedMs` and
 * `lastAt` move with each hit.
 */
export const analyticsVisits = pgTable(
  "analytics_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorHash: text("visitor_hash").notNull(),
    /** UTC day the visit started on — the day every report attributes it to. */
    day: date("day", { mode: "string" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    /** Last activity of any kind (pageview, event, engagement beacon). */
    lastAt: timestamp("last_at", { withTimezone: true }).notNull(),
    host: text("host").notNull(),
    entryPath: text("entry_path").notNull(),
    exitPath: text("exit_path").notNull(),
    /** When the exit page was viewed. */
    exitAt: timestamp("exit_at", { withTimezone: true }).notNull(),
    /** The exit pageview's hit; null for a visit that has only events. */
    exitPageviewId: uuid("exit_pageview_id"),
    /** How long the exit page was visible. Duration = exitAt − startedAt + this. */
    exitEngagedMs: integer("exit_engaged_ms").notNull().default(0),
    pageviews: integer("pageviews").notNull().default(0),
    events: integer("events").notNull().default(0),
    /** Visible time summed over every page of the visit. */
    engagedMs: bigint("engaged_ms", { mode: "number" }).notNull().default(0),
    referrerHost: text("referrer_host"),
    referrerPath: text("referrer_path"),
    channel: parsedText("channel", ChannelSchema).notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    /** Always null for now: IP-to-country lookup is a follow-up. */
    country: text("country"),
    language: text("language"),
    device: parsedText("device", DeviceFamilySchema).notNull(),
    browser: parsedText("browser", BrowserFamilySchema).notNull(),
    os: parsedText("os", OsFamilySchema).notNull(),
  },
  (t) => [
    index("analytics_visits_hash_last_at_idx").on(t.visitorHash, t.lastAt),
    index("analytics_visits_day_idx").on(t.day),
    index("analytics_visits_started_at_idx").on(t.startedAt),
  ],
);

export const HitKindSchema = z.enum(["pageview", "event"]);

/** One pageview or custom event inside a visit. */
export const analyticsHits = pgTable(
  "analytics_hits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => analyticsVisits.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    kind: parsedText("kind", HitKindSchema).notNull(),
    path: text("path").notNull(),
    eventName: text("event_name"),
    eventProps: parsedJson("event_props", z.record(z.string(), z.string())),
    /** Pageviews only: the highest cumulative visible time a beacon reported. */
    engagedMs: integer("engaged_ms").notNull().default(0),
  },
  (t) => [index("analytics_hits_visit_idx").on(t.visitId)],
);

/**
 * Daily totals, kept forever. One row per (day, filter level, dimension, value).
 *
 * - `filter_dim = "none"`, `filter_value = ""`: unfiltered.
 * - any other (filter_dim, filter_value): the same breakdown restricted to the
 *   visits that have that one value — e.g. every page's counts among visits
 *   whose channel is Search.
 * - `dimension = "total"`, `value = ""`: the level's summary line.
 *
 * Every column is additive (see `Metrics` in core), so any range is a SUM.
 */
export const analyticsDaily = pgTable(
  "analytics_daily",
  {
    day: date("day", { mode: "string" }).notNull(),
    filterDim: parsedText("filter_dim", FilterLevelSchema).notNull(),
    filterValue: text("filter_value").notNull(),
    dimension: parsedText("dimension", DailyDimensionSchema).notNull(),
    value: text("value").notNull(),
    visitors: integer("visitors").notNull(),
    visits: integer("visits").notNull(),
    pageviews: integer("pageviews").notNull(),
    bounces: integer("bounces").notNull(),
    durationMs: bigint("duration_ms", { mode: "number" }).notNull(),
    events: integer("events").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.day, t.filterDim, t.filterValue, t.dimension, t.value],
    }),
    index("analytics_daily_level_idx").on(
      t.filterDim,
      t.filterValue,
      t.dimension,
      t.day,
    ),
  ],
);
