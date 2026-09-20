import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import { NextStepSchema } from "../../core/step";

// The learner's own history: one row per step they chose to take. Nothing can
// rebuild it — it is a record of decisions, not of data — so the table is KEPT
// in worktree forks and backups, and it stays in the change feed, which is what
// pushes `chord.curriculum`. No growth bound is declared: a row is written only
// when a person presses Add, so the table grows at the speed of someone
// learning, and the retention monitor's silencing set must only hold bounds
// that are real. See the plugin's CLAUDE.md.
//
// This file is a load-order leaf (drizzle-kit loads it on its own), so it
// imports the step schema from its core module directly, never through the
// core barrel.

/** One step up the ladder: what it unlocked, and when. */
export const _chordUnlocks = pgTable("chord_unlocks", {
  /**
   * The level the step reached: 2, 3, 4… Level 1 is `FIRST_LEVEL`, a constant,
   * so there is never a row for it. Primary key, so two tabs unlocking at once
   * cannot both write the same level — the second fails loudly.
   */
  position: integer("position").primaryKey(),
  /**
   * The step itself (`NextStep`): the chords and modes it opened, with the
   * stage they came from, or the ask rung it reached. The step is stored, not a
   * stage index, so a later edit to the stage list cannot rewrite what someone
   * already unlocked.
   */
  step: parsedJson("step", NextStepSchema).notNull(),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
