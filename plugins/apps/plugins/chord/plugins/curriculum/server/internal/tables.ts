import { z } from "zod";
import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { deriveUpdatedAt } from "@plugins/database/plugins/derived-updated-at/server";
import {
  parsedJson,
  parsedText,
} from "@plugins/database/plugins/sql-column/server";
import { HookpadModeSchema } from "@plugins/integrations/plugins/hooktheory/core";
import { BlanksSchema } from "../../core/blanks";
import { SelectedChordSchema } from "../../core/selection";

// What the learner has chosen: one row, written only when they change a
// setting. It is theirs and nothing can rebuild it, so it is KEPT in worktree
// forks and backups, and stays in the change feed, which is what pushes
// `chord.curriculum`. No growth bound: it is one row, always. See the plugin's
// CLAUDE.md.
//
// No row yet means nobody has changed anything: the loader answers
// `firstSelection()` and the first write inserts the row.
//
// This file is a load-order leaf (drizzle-kit loads it on its own), so it
// imports its schemas from their core modules directly, never through the
// core barrel.

export const _chordCurriculum = deriveUpdatedAt(
  pgTable("chord_curriculum", {
    /** Always 1: there is one learner per instance, so one selection. */
    id: integer("id").primaryKey(),
    /** Every chord that is not off, and whether it is practised or only heard. */
    chords: parsedJson("chords", z.array(SelectedChordSchema)).notNull(),
    blanks: parsedText("blanks", BlanksSchema).notNull(),
    /** The key modes a loop may be in. Never empty. */
    modes: parsedJson("modes", z.array(HookpadModeSchema).min(1)).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  { touchedBy: { chords: true, blanks: true, modes: true, id: false } },
);
