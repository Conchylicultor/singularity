import { boolean, jsonb, text } from "drizzle-orm/pg-core";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import type { RhythmPattern } from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import {
  DEFAULT_BASS_FIGURATION_ID,
  DEFAULT_CHORD_FIGURATION_ID,
} from "@plugins/apps/plugins/sonata/plugins/voicing/core";

// Per-song rhythm groove attached to the library's `sonata_songs` row via the
// entity-extensions primitive (1:1 side-table, FK CASCADE on song delete).
// `enabled` gates the groove; `bass`/`chord` hold each hand's onset pattern as
// jsonb (`.$type<RhythmPattern>()` — `.array()` has no precedent in this repo).
// `bassPatternId`/`chordPatternId` hold each hand's tone-order figuration id (the
// *what*, orthogonal to the rhythm *when*); they default to today's sound so
// existing rows backfill without a groove change. An absent row reads as disabled
// (today's block-chord behavior). Owned here so the library schema stays stable
// and this feature is independently composable. Table: `sonata_songs_ext_rhythm`.
export const songRhythm = defineExtension(_songs, "rhythm", {
  enabled: boolean("enabled").notNull().default(false),
  bass: jsonb("bass").$type<RhythmPattern>().notNull(),
  chord: jsonb("chord").$type<RhythmPattern>().notNull(),
  bassPatternId: text("bass_pattern_id").notNull().default(DEFAULT_BASS_FIGURATION_ID),
  chordPatternId: text("chord_pattern_id").notNull().default(DEFAULT_CHORD_FIGURATION_ID),
});
export const _songRhythmExt = songRhythm.table; // drizzle-kit discovery
