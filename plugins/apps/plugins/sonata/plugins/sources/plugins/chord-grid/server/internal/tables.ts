import { integer, text } from "drizzle-orm/pg-core";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// This source's persisted data for a song, attached to the library's
// `sonata_songs` row via the entity-extensions primitive (1:1 side-table, FK
// CASCADE on song delete). Owned here so the library schema stays source-agnostic
// and a new source needs zero library changes. Table: `sonata_songs_ext_chord_grid`.
export const songChordGrid = defineExtension(_songs, "chord_grid", {
  chordText: text("chord_text").notNull(),
  voicingId: text("voicing_id").notNull(),
  octave: integer("octave").notNull(),
});
export const _songChordGridExt = songChordGrid.table; // drizzle-kit discovery
