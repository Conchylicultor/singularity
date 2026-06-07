import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * One persisted per-(song, track) view override. `color` is nullable: a null
 * means "no override — fall back to the palette default for the track's index".
 * `instrument` is likewise nullable: null means "auto" — derive the timbre from
 * the track's GM program, else the default instrument. `muted` silences the
 * track in the audio scheduler; `hidden` removes its notes from the piano-roll.
 * Both default to false so an absent row reads as the natural "audible + visible"
 * state.
 */
export const TrackViewRowSchema = z.object({
  songId: z.string(),
  trackId: z.string(),
  color: z.string().nullable(),
  instrument: z.string().nullable(),
  muted: z.boolean(),
  hidden: z.boolean(),
});
export type TrackViewRow = z.infer<typeof TrackViewRowSchema>;

/**
 * Flat list of every persisted track-view override across all songs (mirrors
 * the playback-history rollup shape). Consumers filter to the current song
 * client-side; the list is tiny (a handful of rows per song).
 */
export const trackViewResource = resourceDescriptor<TrackViewRow[]>(
  "sonata-track-view",
  z.array(TrackViewRowSchema),
  [],
);
