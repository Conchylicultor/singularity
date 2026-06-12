/**
 * Chord → notes (voicing) — the forward direction of the two-layer model. Builds
 * concrete MIDI pitches from a chord's root + quality intervals, and rotates them
 * into inversions. Pure, framework-free; consumed by chord readouts and any
 * surface that needs to draw or sound a chord's notes.
 */

import { qualityToIntervals } from "./chords";

const pc12 = (pc: number): number => ((pc % 12) + 12) % 12;

/**
 * Root-position MIDI pitches for a chord, ascending. The root sits at the given
 * scientific `octave` (MIDI 60 = C4 ⇒ octave 4), with each chord tone stacked
 * above it. E.g. `{root:0,quality:"maj"}` at octave 4 → [60, 64, 67].
 */
export function chordPitches(
  data: { root: number; quality: string },
  octave = 4,
): number[] {
  const base = 12 * (octave + 1) + pc12(data.root);
  return [base, ...qualityToIntervals(data.quality).map((i) => base + i)];
}

/**
 * The k-th inversion of an ascending voicing: raise the lowest `k` notes an
 * octave and re-sort ascending. k=0 returns the voicing unchanged. E.g.
 * [60,64,67] → 1st inversion [64,67,72], 2nd [67,72,76].
 */
export function invertVoicing(pitches: readonly number[], k: number): number[] {
  const p = [...pitches];
  for (let i = 0; i < k && i < p.length; i++) p[i] = p[i]! + 12;
  return p.sort((a, b) => a - b);
}
