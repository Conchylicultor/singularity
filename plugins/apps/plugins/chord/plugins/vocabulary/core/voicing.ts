import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordPitches,
  invertVoicing,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { chordStack, pc12 } from "./stack";

/** MIDI middle C (C4). */
const MIDDLE_C = 60;

/**
 * The MIDI notes of a chord in the key whose tonic is `tonicPc` (0–11), for the
 * piano: a close voicing of the token's stack with its inversion's tone in the
 * bass, and the bass on the pitch nearest middle C (F♯3 to F4), so every chord
 * sits in the same register. Ascending.
 */
export function chordVoicing(token: ChordToken, tonicPc: number): number[] {
  if (!Number.isInteger(tonicPc) || tonicPc < 0 || tonicPc > 11) {
    throw new Error(`A tonic pitch class is 0–11, got ${tonicPc}`);
  }
  const stack = chordStack(token);
  const rootPosition = chordPitches(
    // The stack is given as intervals, so the quality is never read.
    {
      root: tonicPc + stack.root,
      quality: "",
      intervals: stack.tones.slice(1),
    },
    4,
  );
  const voiced = invertVoicing(rootPosition, stack.bassIndex);
  const [bass] = voiced;
  if (bass === undefined) throw new Error("A voicing has at least its root");
  const target = MIDDLE_C - 6 + pc12(bass - (MIDDLE_C - 6));
  return voiced.map((pitch) => pitch + target - bass);
}
