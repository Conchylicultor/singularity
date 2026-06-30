import { integer } from "drizzle-orm/pg-core";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// Per-song global transpose offset attached to the library's `sonata_songs` row
// via the entity-extensions primitive (1:1 side-table, FK CASCADE on song
// delete). `semitones` shifts the whole song up/down; an absent row reads as `0`
// (original pitch). Owned here so the library schema stays stable and this
// feature is independently composable. Table: `sonata_songs_ext_transpose`.
export const songTranspose = defineExtension(_songs, "transpose", {
  semitones: integer("semitones").notNull().default(0),
});
export const _songTransposeExt = songTranspose.table; // drizzle-kit discovery
