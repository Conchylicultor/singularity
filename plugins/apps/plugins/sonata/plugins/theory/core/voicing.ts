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
 *
 * `data.intervals`, when present (altered/extended chords the parser realised
 * beyond their base quality), is the authoritative interval set; otherwise the
 * intervals derive from `quality`.
 */
export function chordPitches(
  data: { root: number; quality: string; intervals?: readonly number[] },
  octave = 4,
): number[] {
  const base = 12 * (octave + 1) + pc12(data.root);
  const intervals = data.intervals ?? qualityToIntervals(data.quality);
  return [base, ...intervals.map((i) => base + i)];
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

/**
 * Distance of a candidate voicing to a previous one: the sum, over each note in
 * `cand`, of its distance to the nearest note in `prev` (an asymmetric
 * nearest-neighbour cost). This rewards landing each new note close to *some*
 * note the hand already played — the intuition behind smooth voice-leading —
 * and is cheap to evaluate over the small candidate set below.
 */
function voicingDistance(cand: readonly number[], prev: readonly number[]): number {
  let total = 0;
  for (const c of cand) {
    let best = Infinity;
    for (const p of prev) {
      const d = Math.abs(c - p);
      if (d < best) best = d;
    }
    total += best;
  }
  return total;
}

/**
 * Voice-lead a chord's root-position pitches toward the previous chord's voiced
 * pitches, choosing the octave/inversion placement nearest to `prev`. The
 * pitch-class set is unchanged — only octave and inversion choice — so key
 * inference is unaffected.
 *
 * Candidates are every inversion of the chord (via {@link invertVoicing}) over a
 * small window of whole-chord octave shifts (−1, 0, +1 octave on top of each
 * inversion). The winner minimizes {@link voicingDistance} to `prev`; ties break
 * toward the lower (earlier-enumerated) candidate, keeping the result
 * deterministic. `prev === null` (the first chord) returns root position,
 * sorted ascending.
 */
export function nearestVoicing(
  rootPositionPitches: number[],
  prev: number[] | null,
): number[] {
  const root = [...rootPositionPitches].sort((a, b) => a - b);
  if (prev === null) return root;
  if (root.length === 0) return root;

  let bestCand = root;
  let bestDist = Infinity;
  for (let k = 0; k < root.length; k++) {
    const inv = invertVoicing(root, k);
    for (const shift of [-12, 0, 12]) {
      const cand = inv.map((p) => p + shift).sort((a, b) => a - b);
      const dist = voicingDistance(cand, prev);
      if (dist < bestDist) {
        bestDist = dist;
        bestCand = cand;
      }
    }
  }
  return bestCand;
}
