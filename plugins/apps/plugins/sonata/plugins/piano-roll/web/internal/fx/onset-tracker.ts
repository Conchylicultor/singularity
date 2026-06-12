/**
 * Onset tracker — pure note-on detection from cursor positions.
 *
 * No onset surface exists on the audio engine, so the FX host derives note-on
 * events from the same per-frame cursor the display already receives: each
 * `advance(curBeat)` returns the notes whose onset lies in the half-open
 * interval `(prevBeat, curBeat]`. Open at `prev` / closed at `cur` makes
 * consecutive frames tile the timeline exactly — every onset fires once, even
 * when a frame boundary lands exactly on it, and a repeated `advance` with the
 * same beat returns nothing (no double-fire).
 *
 * SEEKS MUST NOT BURST: jumping the cursor forward over fifty notes (scrub,
 * progress-bar click) is navigation, not performance — replaying every skipped
 * onset as a particle burst would be noise. Any backward jump, or a forward
 * jump larger than `maxGapBeats`, is treated as a seek: the tracker re-anchors
 * at the new position and returns []. Real playback frames advance a tiny
 * fraction of a beat (a 60fps frame at 240bpm is 0.067 beats), so the default
 * ceiling of 4 beats — a full 4/4 bar — is orders of magnitude above any
 * legitimate frame step while still catching even slow scrubs.
 *
 * Pure and allocation-light: notes are sorted by onset once at construction;
 * re-anchoring binary-searches the sorted array; `advance` walks a cursor
 * index forward (amortized O(1) per frame, O(k) for the k notes returned —
 * dense chords at one onset all come out of the same call).
 */
import type { Note } from "@plugins/apps/plugins/sonata/plugins/score/core";

/** Forward jump (in beats) beyond which an advance is treated as a seek. */
const DEFAULT_MAX_GAP_BEATS = 4;

export interface OnsetTracker {
  /**
   * Move the cursor to `curBeat`; returns notes with onset ∈ (prevBeat, curBeat],
   * in onset order. Backward jumps and forward jumps > `maxGapBeats` re-anchor
   * silently and return [] (see the seek rule above).
   */
  advance(curBeat: number): Note[];
  /**
   * Re-anchor at `atBeat` (seek/score-jump), dropping any pending onsets.
   * INCLUSIVE of the anchor: a note starting exactly at `atBeat` fires on the
   * next advance — the audio scheduler sounds a note sitting exactly at the
   * resume position, so its FX must fire too (most visibly: the very first
   * note of a score when pressing play from beat 0).
   */
  reset(atBeat: number): void;
}

/**
 * Binary search over the onset-sorted notes. `firstAfter` finds the first
 * index strictly after `beat` (the post-advance cursor); `firstAtOrAfter`
 * finds the first index at-or-after it (the post-reset cursor — inclusive
 * anchor, see `reset`).
 */
function firstIndex(
  sorted: readonly Note[],
  beat: number,
  inclusive: boolean,
): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const consumed = inclusive ? sorted[mid]!.start < beat : sorted[mid]!.start <= beat;
    if (consumed) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function createOnsetTracker(
  notes: Note[],
  opts?: { maxGapBeats?: number },
): OnsetTracker {
  const maxGapBeats = opts?.maxGapBeats ?? DEFAULT_MAX_GAP_BEATS;
  // Sorted copy — never mutate the caller's array. Stable sort keeps the
  // authored order within a chord (same onset), so FX see chords in score order.
  const sorted = [...notes].sort((a, b) => a.start - b.start);

  // The anchor: `nextIdx` is the first unconsumed note. After a normal
  // advance that is the first onset strictly after `prevBeat`; after a reset
  // it is the first onset AT-or-after the anchor (inclusive — a note exactly
  // at the resume position fires, matching the audio scheduler). The initial
  // state is a reset at beat 0, so a score's very first note (almost always
  // authored at exactly 0) fires when play starts from the top.
  let prevBeat = 0;
  let nextIdx = firstIndex(sorted, 0, true);

  const reset = (atBeat: number): void => {
    prevBeat = atBeat;
    nextIdx = firstIndex(sorted, atBeat, true);
  };

  return {
    reset,
    advance(curBeat) {
      // Seek detection: backward, or forward beyond any plausible frame step.
      if (curBeat < prevBeat || curBeat - prevBeat > maxGapBeats) {
        reset(curBeat);
        return [];
      }
      // Normal frame: emit every onset in (prevBeat, curBeat]. The while-walk
      // naturally returns ALL notes sharing one onset (dense chords) at once.
      const fired: Note[] = [];
      while (nextIdx < sorted.length && sorted[nextIdx]!.start <= curBeat) {
        fired.push(sorted[nextIdx]!);
        nextIdx++;
      }
      prevBeat = curBeat;
      return fired;
    },
  };
}
