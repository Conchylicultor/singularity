import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
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

/** Reactive list of every song's playback rollup (push resource). */
export const playbackHistoryResource = resourceDescriptor<PlaybackHistoryRow[]>(
  "sonata-playback-history",
  z.array(PlaybackHistoryRowSchema),
  [],
);
