import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { nullable } from "@plugins/fields/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

/**
 * One song's playback rollup. Mutable usage data written by the player (not the
 * library): how many times the song has been played and when it was last played.
 * `lastPlayedAt` is a `Date` on both sides (the date field's schema decodes the
 * JSON ISO string back into one). Stored in the `sonata_songs_ext_playback`
 * entity-extension table, which `server/internal/tables.ts` builds from this
 * shape.
 */
export const playbackHistoryShape = defineExtensionShape({
  key: "songId",
  fields: {
    playCount: intField(),
    lastPlayedAt: nullable(dateField()),
  },
});
export const PlaybackHistoryRowSchema = playbackHistoryShape.schema;
export type PlaybackHistoryRow = z.infer<typeof PlaybackHistoryRowSchema>;

/**
 * Every song's playback rollup — the whole `sonata_songs_ext_playback` table as
 * one value, recomputed and pushed whole by the DB change-feed on every play.
 * No placeholder: before the first value lands the read is `pending`.
 *
 * A whole-table value, not a collection, until Resources item 7: its reader is
 * the library's Plays / Last-played field extension, which the library DataView
 * sorts over every song client-side. The bounded form needs joined side-table
 * sort/filter columns on the songs collection, the host rows in data-view's
 * `FieldExtensionProps`, and live-window paging in DataView. The server states
 * that bound (`unbounded: { reason }`).
 */
export const playbackHistory = liveValue("sonata-playback-history", {
  schema: z.array(PlaybackHistoryRowSchema),
});
