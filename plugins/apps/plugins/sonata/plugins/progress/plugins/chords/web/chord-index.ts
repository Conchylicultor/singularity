/** A beat span — the part of a chord annotation the lane positions by. */
export interface BeatSpan {
  start: number;
  end: number;
}

/**
 * Index of the span holding `beat` (`start <= beat < end`), or -1 when the beat
 * falls in a gap, before the first span or past the last. `spans` must be sorted
 * by `start` and non-overlapping (a song's chord annotations). A binary search,
 * because the cursor selector runs it on every playback frame.
 */
export function chordIndexAt(spans: readonly BeatSpan[], beat: number): number {
  let lo = 0;
  let hi = spans.length - 1;
  let found = -1;
  // The last span starting at or before the beat.
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid]!.start <= beat) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 && beat < spans[found]!.end ? found : -1;
}
