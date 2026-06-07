import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";

/**
 * Per-(song, track) view override. 1:many over a song (one row per track), so
 * this is a plain table with a compound PK — NOT an entity-extension (those are
 * strictly 1:1 on the parent id). The FK cascades on song delete so overrides
 * are reclaimed with their song. `trackId` is the Score's `TrackMeta.id` (e.g.
 * `t0`, or `L0:t0` for a merged multi-source score).
 */
export const _trackView = pgTable(
  "sonata_track_view",
  {
    songId: text("song_id")
      .notNull()
      .references(() => _songs.id, { onDelete: "cascade" }),
    trackId: text("track_id").notNull(),
    color: text("color"),
    muted: boolean("muted").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.songId, t.trackId] })],
);
