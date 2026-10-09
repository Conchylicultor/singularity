import { z } from "zod";

// ── How much of the loop the learner names ───────────────────────────────────
//
// One of the things the learner chooses (the others: which chords, and how
// many other chords a loop may hold). Only practised chords are ever blank;
// every other box is given.
//
//   all    → every practised box
//   first  → every practised box but the loop's first, given as the anchor: "All but first"
//   random → half of the practised boxes, rounded up, picked when the loop is dealt
//   half   → every practised box in the loop's second half (the cadence): "Last half"

export const BLANKS = ["all", "first", "random", "half"] as const;
export const BlanksSchema = z.enum(BLANKS);
export type Blanks = z.infer<typeof BlanksSchema>;

/** How each setting is named on its control. */
export const BLANKS_LABEL: Record<Blanks, string> = {
  all: "All",
  first: "All but first",
  random: "Random half",
  half: "Last half",
};

/**
 * Every blanks setting a saved answer can carry: the settable ones, plus
 * `one` (the target's last box), which the path offered and which recorded
 * answers still hold. Nothing can set it any more.
 */
export const RECORDED_BLANKS = [...BLANKS, "one"] as const;
export const RecordedBlanksSchema = z.enum(RECORDED_BLANKS);
export type RecordedBlanks = z.infer<typeof RecordedBlanksSchema>;
