import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * One song's playback rollup. Mutable usage data written by the player (not the
 * library): how many times the song has been played and when it was last played.
 * `lastPlayedAt` is an ISO string (crosses the wire as JSON; the server maps the
 * DB `Date`). Stored in the `sonata_songs_ext_playback` entity-extension table.
 */
export const PlaybackHistoryRowSchema = z.object({
  songId: z.string(),
  playCount: z.number(),
  lastPlayedAt: z.string().nullable(),
});
export type PlaybackHistoryRow = z.infer<typeof PlaybackHistoryRowSchema>;

/** Reactive list of every song's playback rollup (push resource). */
export const playbackHistoryResource = resourceDescriptor<PlaybackHistoryRow[]>(
  "sonata-playback-history",
  z.array(PlaybackHistoryRowSchema),
  [],
);
