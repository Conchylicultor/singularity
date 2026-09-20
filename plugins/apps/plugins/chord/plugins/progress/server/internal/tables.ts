import { z } from "zod";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { parsedText } from "@plugins/database/plugins/sql-column/server";
import {
  ChordTokenSchema,
  LOOP_SHAPE_IDS,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";

// The learner's history: every checked round and the answer given for each of
// its boxes. Nothing can rebuild it, so both tables are kept in worktree forks
// and backups, and they stay in the change feed (it drives `chord.progress`).
// No growth bound: rows are written only when a person checks a round, so they
// grow only as fast as someone plays. See the plugin's CLAUDE.md.
//
// No foreign key to `chord_sections`: that table is a cache the song index
// rebuilds from its snapshot, and the history must outlive any rebuild.
//
// This file is a load-order leaf: it imports no other plugin's tables.

/** One checked round: a loop of one song, answered box by box. */
export const _chordRounds = pgTable(
  "chord_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The TheoryTab section the loop came from. */
    sectionId: text("section_id").notNull(),
    videoId: text("video_id").notNull(),
    shape: parsedText("shape", z.enum(LOOP_SHAPE_IDS)).notNull(),
    /** The loop's first beat (Hookpad's, 1-based), the same double `chord_loop_windows.start_beat` holds. */
    startBeat: doublePrecision("start_beat").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /**
     * Boxes the learner answered — not the boxes of the loop. A round scaffolded
     * by the curriculum asks for some of them and shows the rest filled in;
     * `givenCount` holds those, so the loop had `boxCount + givenCount` boxes.
     */
    boxCount: integer("box_count").notNull(),
    correctCount: integer("correct_count").notNull(),
    /**
     * Boxes shown already filled, which the learner never named. 0 for every
     * round checked before the curriculum existed, and for a round that asks
     * for the whole loop.
     */
    givenCount: integer("given_count").notNull().default(0),
  },
  (t) => [index("chord_rounds_checked_at_idx").on(t.checkedAt)],
);

/** One box of a round: the chord that played, the one picked, and how long it took. */
export const _chordAnswers = pgTable(
  "chord_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => _chordRounds.id, { onDelete: "cascade" }),
    /** The box's place in the round, 0-based. */
    position: integer("position").notNull(),
    /** The chord that played. */
    token: parsedText("token", ChordTokenSchema).notNull(),
    /** The chord the learner picked. */
    answer: parsedText("answer", ChordTokenSchema).notNull(),
    /** `token === answer`, decided by the server. */
    correct: boolean("correct").notNull(),
    answerMs: integer("answer_ms").notNull(),
    /**
     * The round's check time: the trainer reports how long each box took, not
     * when it was filled. Within a round, `position` orders the answers.
     */
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    // A chord's last MASTERY_WINDOW answers: one index scan per chord.
    index("chord_answers_token_answered_at_idx").on(
      t.token,
      t.answeredAt.desc(),
      t.position.desc(),
    ),
    // Today's answers: a range scan.
    index("chord_answers_answered_at_idx").on(t.answeredAt),
    // The cascade from `chord_rounds`, and reading one round back.
    index("chord_answers_round_id_idx").on(t.roundId),
  ],
);
