import { boolean, text } from "drizzle-orm/pg-core";
import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import {
  DEFAULT_BASS_FIGURATION_ID,
  DEFAULT_CHORD_FIGURATION_ID,
} from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import { RhythmPatternSchema } from "../../shared/resources";

// Per-song rhythm groove attached to the library's `sonata_songs` row via the
// entity-extensions primitive (1:1 side-table, FK CASCADE on song delete).
// `enabled` gates the groove; `bass`/`chord` hold each hand's onset pattern as
// jsonb decoded by `RhythmPatternSchema` — the SAME schema the HTTP write
// boundary already validates against, so an onset outside `[0, subdivisions)`
// is now impossible to store by any route, not just the endpoint.
// `bassPatternId`/`chordPatternId` hold each hand's tone-order figuration id (the
// *what*, orthogonal to the rhythm *when*); they default to today's sound so
// existing rows backfill without a groove change. An absent row reads as disabled
// (today's block-chord behavior). Owned here so the library schema stays stable
// and this feature is independently composable. Table: `sonata_songs_ext_rhythm`.
export const songRhythm = defineExtension(_songs, "rhythm", {
  enabled: boolean("enabled").notNull().default(false),
  bass: parsedJson("bass", RhythmPatternSchema).notNull(),
  chord: parsedJson("chord", RhythmPatternSchema).notNull(),
  bassPatternId: text("bass_pattern_id")
    .notNull()
    .default(DEFAULT_BASS_FIGURATION_ID),
  chordPatternId: text("chord_pattern_id")
    .notNull()
    .default(DEFAULT_CHORD_FIGURATION_ID),
});
export const _songRhythmExt = songRhythm.table; // drizzle-kit discovery
