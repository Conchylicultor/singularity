import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// This source's persisted data for a song, attached to the library's
// `sonata_songs` row via the entity-extensions primitive (1:1 side-table, FK
// CASCADE on song delete). Owned here so the library schema stays source-agnostic
// and a new source needs zero library changes. Table: `sonata_songs_ext_chord_grid`.
// Voicing is no longer per-song — the shell's reactive re-voicing step owns chord
// notes under a single global voicing config — so the grid persists chord text only.
// The shape is declared here, not in `shared/`: no live resource carries the row
// to the browser (the editor reads it through `getSongChordGrid`).
const chordGridShape = defineExtensionShape({
  key: "songId",
  fields: { chordText: textField() },
});
export const songChordGrid = defineExtension(
  _songs,
  "chord_grid",
  chordGridShape,
);
export const _songChordGridExt = songChordGrid.table; // drizzle-kit discovery
