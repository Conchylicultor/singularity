import { z } from "zod";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { HookpadModeSchema } from "@plugins/integrations/plugins/hooktheory/core";
import { StageIdSchema } from "./stages";

// ── A step: one move up the ladder ───────────────────────────────────────────
//
// The learner climbs on two axes. A step moves one of them, never both:
//
// - `chords` — new chords to hear (and, opening a stage, the key modes that
//   come with them). It records the STAGE the chords came from, not a stage
//   index, so a later edit to the stage list cannot rewrite what someone
//   already unlocked.
// - `ask` — more of the loop to name: the cadence, then the whole thing.
//
// This is what `chord_unlocks` stores, one row per step, and what the "next
// step" read offers and the unlock takes back.

export const NextStepSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("chords"),
      stage: StageIdSchema,
      /** The chords this step opens. Empty when the step opens only a key mode. */
      tokens: z.array(ChordTokenSchema),
      /** The key modes this step opens. Empty when it opens only chords. */
      modes: z.array(HookpadModeSchema),
    }),
    z.object({
      kind: z.literal("ask"),
      /** The rung reached. `target` is where everyone starts, so it is never a step. */
      rule: z.enum(["half", "all"]),
    }),
  ])
  // A step that opens neither a chord nor a mode is not a step: the ladder
  // would sit on it forever, one level higher and no better off.
  .refine(
    (step) =>
      step.kind !== "chords" || step.tokens.length + step.modes.length > 0,
    { message: "a chords step opens at least one chord or one key mode" },
  );
export type NextStep = z.infer<typeof NextStepSchema>;

/**
 * Whether two steps are the same move. Both come from the same server
 * computation, so the chord and mode lists are compared in order rather than
 * as sets: a difference of order is a difference of answer.
 */
export function sameStep(a: NextStep, b: NextStep): boolean {
  if (a.kind === "ask") return b.kind === "ask" && a.rule === b.rule;
  return (
    b.kind === "chords" &&
    a.stage === b.stage &&
    a.tokens.length === b.tokens.length &&
    a.tokens.every((token, i) => token === b.tokens[i]) &&
    a.modes.length === b.modes.length &&
    a.modes.every((mode, i) => mode === b.modes[i])
  );
}
