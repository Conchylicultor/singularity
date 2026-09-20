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

/**
 * Every note the app sounds for a chord, and therefore every key it lights.
 *
 * Two parts, because they are heard and drawn differently:
 *
 *  - `voicing` — the close voicing, its inversion's tone lowest. What the chord
 *    IS.
 *  - `bass` — that voicing's lowest note doubled an octave below. What holds
 *    it up: a chord with a bass under it reads as a record's chord rather than
 *    as three notes in the middle of the keyboard, and the octave is where the
 *    bass of the inversion becomes audible as the bass.
 *
 * `pitches` is the two together, ascending — the list the piano is handed and
 * the list the keyboard lights. Having ONE expression produce all three is what
 * stops the picture and the sound disagreeing: there is no second place that
 * could decide to draw the doubled bass without playing it, or the other way
 * round.
 *
 * The register follows the inversion, because the voicing does: a chord in
 * first inversion puts its 3rd lowest, and the bass doubles THAT. Hookpad gives
 * the inversion for every chord and the token keeps it (`chordStack`), so this
 * is the data's own answer, not a convention imposed here.
 */
export type ChordSound = {
  /** The doubled bass: the voicing's lowest note, an octave below. */
  bass: number;
  /** The close voicing, its inversion's tone lowest, ascending. */
  voicing: number[];
  /** Every note that sounds, ascending: the bass, then the voicing. */
  pitches: number[];
};

/** What the app plays — and draws — for a chord in the key whose tonic is `tonicPc` (0–11). */
export function chordSound(token: ChordToken, tonicPc: number): ChordSound {
  const voicing = chordVoicing(token, tonicPc);
  const [lowest] = voicing;
  if (lowest === undefined) throw new Error("A voicing has at least its root");
  const bass = lowest - 12;
  return { bass, voicing, pitches: [bass, ...voicing] };
}
