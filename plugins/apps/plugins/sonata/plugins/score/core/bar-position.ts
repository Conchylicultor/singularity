import { bars } from "./helpers";
import type { Score } from "./types";

/**
 * Musical bar numbers over `bars(score)`. A pickup (anacrusis) is bar 0 and the
 * first full bar is bar 1; with no pickup the first bar is bar 1. `bars()`
 * indexes its list from 0 either way, so the number is the index shifted by one
 * exactly when there is no pickup.
 */
function firstBarNumber(score: Score): number {
  return (score.meta.pickupBeats ?? 0) > 0 ? 0 : 1;
}

/**
 * The start beat of musical bar `bar` (see {@link firstBarNumber} for the
 * numbering), read off the meter map so a time-signature change moves every
 * later bar line. A bar past the song's last bar clamps to the last bar's
 * start; one before the first clamps to the first. `bar` must be an integer —
 * a fractional bar has no start, so it throws.
 */
export function barStartBeat(score: Score, bar: number): number {
  if (!Number.isInteger(bar)) {
    throw new Error(`barStartBeat: bar must be an integer, got ${bar}`);
  }
  const list = bars(score);
  // `bars()` always yields at least one entry (the implicit first bar).
  const i = Math.min(list.length - 1, Math.max(0, bar - firstBarNumber(score)));
  return list[i]!.startBeat;
}

/** A playhead position as musical bar and beat-in-bar, both 1-based (pickup bar 0). */
export interface BarPosition {
  bar: number;
  /** The beat within the bar, counted in the bar's own meter unit (an eighth in 6/8). */
  beat: number;
}

// Below this a playhead sitting on a bar or beat line still counts as on it (the
// cursor stops on lines computed in floating point).
const EPS = 1e-6;

/**
 * Where `beat` (quarter-note beats on the score timeline) falls as bar.beat. A
 * beat before the first bar (the negative lead-in pre-roll) reads as the first
 * bar's first beat.
 */
export function barPositionAt(score: Score, beat: number): BarPosition {
  const list = bars(score);
  let i = 0;
  while (i + 1 < list.length && list[i + 1]!.startBeat <= beat + EPS) i++;
  const start = list[i]!.startBeat;
  const sigs = [...score.timeSigMap].sort((a, b) => a.beat - b.beat);
  let denominator = 4;
  for (const sig of sigs)
    if (sig.beat <= start + EPS) denominator = sig.denominator;
  const unit = 4 / denominator;
  const inBar = Math.max(0, beat - start);
  return {
    bar: i + firstBarNumber(score),
    beat: Math.floor(inBar / unit + EPS) + 1,
  };
}
