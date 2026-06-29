import {
  bars,
  beatGrid,
  type Note,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  ACCENT_PITCH,
  CLICK_DURATION_BEATS,
  METRONOME_TRACK,
  NORMAL_PITCH,
} from "./constants";

// Bar-start beats and grid-cell beats are both accumulated from 0 by the same
// pure derivation, so an exact-match Set keyed on a rounded beat is reliable for
// the meters Sonata handles. The rounding (sub-millibeat, matching the score
// helpers' own LINE_EPS scale) guards against float drift in odd meters.
const roundBeat = (beat: number): number => Math.round(beat * 1000) / 1000;

/**
 * Build the synthetic click track for the continuous metronome: one tiny note
 * per notated beat (`beatGrid(score, 1)`), with the first beat of each bar
 * accented (when `accentDownbeat`) via the {@link ACCENT_PITCH} sentinel.
 *
 * PURE and tempo-INVARIANT: it reads only beat positions (`bars` / `beatGrid`),
 * which `scaleTempo` never touches — so a tempo drag leaves this list unchanged
 * and the engine's `retime` re-times the clicks without rebuilding them.
 */
export function buildClickNotes(score: Score, accentDownbeat: boolean): Note[] {
  const grid = beatGrid(score, 1);
  // O(1) downbeat lookup: the set of bar-start beats.
  const downbeats = new Set(bars(score).map((b) => roundBeat(b.startBeat)));

  return grid.map((cell, i) => ({
    id: `${METRONOME_TRACK}:${i}`,
    pitch:
      accentDownbeat && downbeats.has(roundBeat(cell.startBeat))
        ? ACCENT_PITCH
        : NORMAL_PITCH,
    start: cell.startBeat,
    duration: CLICK_DURATION_BEATS,
    velocity: 100,
    track: METRONOME_TRACK,
  }));
}
