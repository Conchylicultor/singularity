import type { Box } from "./round";

// ── When has a box's chord finished sounding? ────────────────────────────────
//
// The answer clock of a box starts the first time its chord FINISHES sounding
// in the round (see `answer-time.ts`). The trainer watches the playhead, one
// read per animation frame, and asks this function which boxes finished
// between two reads.

/**
 * A chord counts as finished this close to its end: the loop jumps back to its
 * start when the playhead is within 50 ms of the loop's end, so the last box
 * never reads its own end exactly.
 */
export const FINISH_EPSILON_S = 0.05;

/**
 * How near its end the playhead must have been, before a jump back, for a box
 * to count as heard out. The loop's wrap is that jump, and the last read before
 * it lands one frame (plus the player's extrapolation) short of the end.
 */
export const WRAP_TOLERANCE_S = 0.3;

/**
 * The positions of the boxes whose chord finished sounding as the playhead
 * moved from `prev` to `next` (seconds into the video).
 *
 * - Forward: every box whose end lies in `(prev, next]`.
 * - Backward (the loop wrapping to its start, or a seek back): the box the
 *   playhead was in, if it was within `WRAP_TOLERANCE_S` of its end — the last
 *   chord of the loop finishes by being cut off by the wrap.
 */
export function finishedBoxes(
  boxes: readonly Box[],
  prev: number,
  next: number,
): number[] {
  if (next >= prev) {
    return boxes
      .filter((box) => {
        const end = box.endSec - FINISH_EPSILON_S;
        return prev < end && next >= end;
      })
      .map((box) => box.position);
  }
  return boxes
    .filter(
      (box) =>
        prev >= box.startSec &&
        prev >= box.endSec - WRAP_TOLERANCE_S &&
        prev <= box.endSec + WRAP_TOLERANCE_S,
    )
    .map((box) => box.position);
}

/** The box sounding at `t` (seconds into the video), or null in a rest or outside the loop. */
export function boxAt(boxes: readonly Box[], t: number): Box | null {
  return boxes.find((box) => t >= box.startSec && t < box.endSec) ?? null;
}

/**
 * Where `t` falls on the round's beat grid, in beats from the window's start:
 * read inside the box sounding at `t` (linear between its start and end, which
 * is how the alignment reads a box's span), or null in a rest or outside the
 * loop.
 */
export function gridBeatAt(boxes: readonly Box[], t: number): number | null {
  const box = boxAt(boxes, t);
  if (box === null) return null;
  const span = box.endSec - box.startSec;
  const fraction = span > 0 ? (t - box.startSec) / span : 0;
  return box.gridStart + fraction * box.gridSpan;
}
