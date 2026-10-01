import { z } from "zod";
import { liveColumns } from "@plugins/network/plugins/live/core";
import {
  liveInstant,
  liveNumber,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { songLibrary } from "@plugins/apps/plugins/sonata/plugins/library/core";

/**
 * A song's play stats as columns of the song library (`sonata.songs`): every
 * library row carries them under `$columns.playback`, and the library sorts and
 * filters by them like its own ("Most played", "Recently played", "Unplayed").
 * Served by this plugin's server from the `sonata_songs_ext_playback` extension
 * (`serveColumns` over `songPlayback.join`).
 *
 * `playCount` is never null: the extension declares its default (0), which the
 * join reads for a song with no playback row, so a never-played song sorts and
 * filters as 0. `lastPlayedAt` has no default — null until the first play.
 */
export const playbackColumns = liveColumns(songLibrary, "playback", {
  row: z.object({
    playCount: z.number(),
    lastPlayedAt: z.coerce.date().nullable(),
  }),
  filterable: { playCount: liveNumber(), lastPlayedAt: liveInstant() },
  sortable: ["playCount", "lastPlayedAt"],
});
