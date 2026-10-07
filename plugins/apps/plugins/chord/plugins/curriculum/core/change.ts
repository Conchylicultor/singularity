import { z } from "zod";
import {
  ChordTokenSchema,
  type ChordToken,
  type LoopExtras,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { Blanks } from "./blanks";
import { ChordStateSchema, type ChordState, type Selection } from "./selection";

// ── The writes, as pure functions over a selection ───────────────────────────
//
// The server applies these inside one transaction (`updateSelection`); being
// pure, they are what the tests check. None can be refused: every selection is
// one the trainer can play, or says plainly why it cannot (no chord practised).

/** One chord to practise, hear only, or turn off. */
export const ChordChangeSchema = z.object({
  token: ChordTokenSchema,
  state: ChordStateSchema,
});
export type ChordChange = z.infer<typeof ChordChangeSchema>;

/** One chord to practise, hear only, or off. */
export function withChordState(
  selection: Selection,
  token: ChordToken,
  state: ChordState,
): Selection {
  const others = selection.chords.filter((c) => c.token !== token);
  return {
    ...selection,
    chords: state === "off" ? others : [...others, { token, state }],
  };
}

/**
 * Several chords at once, in order — one chip, a whole section, a rare group,
 * Clear (every chord on, sent as off) and its Undo (the snapshot before it). A
 * token named twice ends in its last state.
 */
export function withChordChanges(
  selection: Selection,
  changes: readonly ChordChange[],
): Selection {
  return changes.reduce(
    (next, change) => withChordState(next, change.token, change.state),
    selection,
  );
}

export function withBlanks(selection: Selection, blanks: Blanks): Selection {
  return { ...selection, blanks };
}

export function withExtras(
  selection: Selection,
  extras: LoopExtras,
): Selection {
  return { ...selection, extras };
}
