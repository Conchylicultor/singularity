import { z } from "zod";
import { liveColumns } from "@plugins/network/plugins/live/core";
import {
  liveBoolean,
  liveNumber,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { songLibrary } from "@plugins/apps/plugins/sonata/plugins/library/core";

/**
 * A song's MIDI facts as columns of the song library (`sonata.songs`): every
 * library row carries them under `$columns.midi`, and the library sorts and
 * filters by them like its own. Served by this plugin's server from the
 * `sonata_songs_ext_midi` extension (`serveColumns` over `songMidi.join`).
 *
 * - `trackCount` — the note-bearing track count; `null` for a song with no MIDI
 *   (no extension row, and no default to read in its place).
 * - `sourceMissing` — a folder-imported song whose `.mid` file left the disk
 *   (the `folders` sub-plugin's field reads it); never null, since the
 *   extension declares its default (`false`), which the join reads for a song
 *   with no MIDI row — so it sorts too (missing files together), as it did in
 *   memory.
 */
export const midiColumns = liveColumns(songLibrary, "midi", {
  row: z.object({
    trackCount: z.number().nullable(),
    sourceMissing: z.boolean(),
  }),
  filterable: { trackCount: liveNumber(), sourceMissing: liveBoolean() },
  sortable: ["trackCount", "sourceMissing"],
});
