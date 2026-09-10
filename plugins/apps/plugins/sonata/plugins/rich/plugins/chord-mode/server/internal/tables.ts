import { boolean } from "drizzle-orm/pg-core";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// Per-song chord mode attached to the library's `sonata_songs` row via the
// entity-extensions primitive (1:1 side-table, FK CASCADE on song delete).
// `enabled` = voice the song's detected chords onto the Chords / Bass tracks
// (the original tracks having been turned off in the mixer). An absent row reads
// as `false` (play the notes as authored). Owned here so the library schema stays
// stable and this feature is independently composable.
// Table: `sonata_songs_ext_chord_mode`.
export const songChordMode = defineExtension(_songs, "chord_mode", {
  enabled: boolean("enabled").notNull().default(false),
});
export const _songChordModeExt = songChordMode.table; // drizzle-kit discovery
