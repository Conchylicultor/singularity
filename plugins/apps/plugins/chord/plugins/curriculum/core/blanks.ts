import { z } from "zod";

// ── How much of the loop the learner names ───────────────────────────────────
//
// One of the two things the learner chooses (the other is which chords they
// practise). Only practised chords are ever blank; every other box is given.
//
//   one  → a single box: the last one of the chord being practised
//   half → every practised box in the loop's second half (the cadence)
//   all  → every practised box

export const BLANKS = ["one", "half", "all"] as const;
export const BlanksSchema = z.enum(BLANKS);
export type Blanks = z.infer<typeof BlanksSchema>;
