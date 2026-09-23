import { z } from "zod";
import {
  ChordTokenSchema,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  HookpadModeSchema,
  type HookpadMode,
} from "@plugins/integrations/plugins/hooktheory/core";
import { BlanksSchema, type Blanks } from "./blanks";

// ── What the learner has chosen ──────────────────────────────────────────
//
// The two axes, set by the learner at any time: each chord's state, and how
// much of the loop is blank. Plus the key modes loops may be in. It is what
// the trainer draws its loops, its answer buttons and its blanks from, so it is
// live: a change in one tab changes every open tab.

/**
 * What a chord is to the learner:
 *
 * - `practice` — its boxes can be blank, and it has an answer button;
 * - `hear` — it can play in a loop, but its boxes are always given;
 * - `off` — no loop holding it is played.
 */
export const CHORD_STATES = ["practice", "hear", "off"] as const;
export const ChordStateSchema = z.enum(CHORD_STATES);
export type ChordState = z.infer<typeof ChordStateSchema>;

/** One chord that is on: `off` is simply not being listed. */
export const SelectedChordSchema = z.object({
  token: ChordTokenSchema,
  state: z.enum(["practice", "hear"]),
});
export type SelectedChord = z.infer<typeof SelectedChordSchema>;

export const SelectionSchema = z.object({
  /** Every chord that is not off, in token order. */
  chords: z.array(SelectedChordSchema),
  blanks: BlanksSchema,
  /** The key modes a loop may be in. Never empty. */
  modes: z.array(HookpadModeSchema).min(1),
});
export type Selection = z.infer<typeof SelectionSchema>;

/** A chord's state in this selection. */
export function chordState(
  selection: Selection,
  token: ChordToken,
): ChordState {
  return selection.chords.find((c) => c.token === token)?.state ?? "off";
}

/** The chords whose boxes can be blank. */
export function practisedChords(selection: Selection): ChordToken[] {
  return selection.chords
    .filter((c) => c.state === "practice")
    .map((c) => c.token);
}

/** Every chord a loop may hold: practised and heard. */
export function playableChords(selection: Selection): ChordToken[] {
  return selection.chords.map((c) => c.token);
}

/** The same selection in one canonical form: chords sorted by token, modes sorted. */
export function canonicalSelection(selection: {
  chords: readonly SelectedChord[];
  blanks: Blanks;
  modes: readonly HookpadMode[];
}): Selection {
  return {
    chords: [...selection.chords].sort((a, b) =>
      a.token < b.token ? -1 : a.token > b.token ? 1 : 0,
    ),
    blanks: selection.blanks,
    modes: [...new Set(selection.modes)].sort(),
  };
}

/** Whether two selections say the same thing, whatever their order. */
export function sameSelection(a: Selection, b: Selection): boolean {
  return (
    JSON.stringify(canonicalSelection(a)) ===
    JSON.stringify(canonicalSelection(b))
  );
}
