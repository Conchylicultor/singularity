/**
 * `ActiveNoteIndex` — a precomputed "what's sounding right now" stabbing index.
 *
 * Answering "which notes are sounding at beat `t`?" by scanning every note in a
 * Score is O(total notes) per query. A surface that asks once per animation
 * frame during playback (the piano keyboard's lit keys) therefore pays O(notes)
 * 60×/sec — thousands of notes on a dense multi-track score — even though the
 * answer only ever depends on the handful of notes sounding right now (the local
 * polyphony). This index does the bucketing ONCE at build time so each `at(beat)`
 * touches only the notes near `beat`.
 *
 * STRUCTURE — a bucketed-by-beat grid. Buckets tile the timeline from the first
 * onset in fixed `bucketBeats`-wide slots; each note is appended to EVERY bucket
 * its `[start, start+duration)` span overlaps — membership is *overlap*, not
 * *onset*. A note longer than one bucket therefore lives in all the buckets it
 * spans, so a long sustained note that started many beats ago is still found in
 * the bucket sitting under the cursor: multi-beat notes are correct by
 * construction, not a special case. `at(beat)` reads the single bucket
 * containing `beat` and keeps the notes whose half-open span actually contains
 * it — O(local polyphony), not O(total notes).
 *
 * Notes are inserted in their original array order, so each bucket lists its
 * notes in `notes` order and `at` returns them that way: callers that pick "the
 * first note per pitch" get the same winner a full-array scan would.
 *
 * Memory is `Σ ceil(durationᵢ / bucketBeats)` references — dominated by short
 * notes (~1 bucket each) with a bounded tail from the few sustained ones.
 * `bucketBeats` is the knob if sustained notes ever dominate (coarser buckets =
 * less duplication, slightly larger per-bucket scans).
 */
import type { Note } from "./types";

/** Default bucket width in quarter-note beats (one quarter note per bucket). */
const DEFAULT_BUCKET_BEATS = 1;

/** A precomputed "notes sounding at beat `t`" index. `at` is O(local polyphony). */
export interface ActiveNoteIndex {
  /**
   * Notes sounding at `beat`: those with `start <= beat < start + duration`,
   * in the original `notes` array order. A zero-duration note is never sounding
   * (the upper bound is exclusive). Out-of-range beats return `[]`.
   */
  at(beat: number): Note[];
}

/**
 * Build an {@link ActiveNoteIndex} from a note list. The list need not be
 * sorted; the original order is preserved within each bucket so the index is a
 * drop-in replacement for a full-array scan (same per-pitch winner). The input
 * array is never mutated.
 */
export function buildActiveNoteIndex(
  notes: readonly Note[],
  opts?: { bucketBeats?: number },
): ActiveNoteIndex {
  const bucketBeats = opts?.bucketBeats ?? DEFAULT_BUCKET_BEATS;

  // No notes (or nothing with a positive duration) → an empty index whose `at`
  // is a constant `[]`. Avoids an NaN anchor from `Math.min()` of nothing.
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const n of notes) {
    if (n.duration <= 0) continue; // never sounding — skip (mirrors `at`'s `<`)
    if (n.start < minStart) minStart = n.start;
    const end = n.start + n.duration;
    if (end > maxEnd) maxEnd = end;
  }
  if (minStart === Infinity) {
    return { at: () => [] };
  }

  // `bucket(t)` maps a beat to its slot index relative to the first onset. It is
  // `floor` of a strictly increasing linear map, hence MONOTONIC — the single
  // property the whole index leans on.
  const bucket = (beat: number): number =>
    Math.floor((beat - minStart) / bucketBeats);

  const buckets: Note[][] = Array.from(
    { length: bucket(maxEnd) + 1 },
    () => [],
  );

  for (const n of notes) {
    if (n.duration <= 0) continue;
    const lo = bucket(n.start);
    // `hi = bucket(end)` directly — NOT excluding the exact-boundary bucket. The
    // membership bound must stay consistent with `bucket()` under floating
    // point: because `bucket` is monotonic, `bucket(t) <= bucket(end)` for every
    // queried `t < end`, so a note placed in `[lo, bucket(end)]` is NEVER missed
    // — no epsilon, no exact-equality test that float rounding could break. A
    // note ending exactly on a boundary lands in one extra bucket, where `at`'s
    // exact `t < start+duration` check harmlessly excludes it (a negligible
    // memory cost traded for a miss-proof bound). `hi >= lo` always, since
    // `end > start` for a positive-duration note and `bucket` is monotonic.
    const hi = bucket(n.start + n.duration);
    for (let i = lo; i <= hi; i++) buckets[i]!.push(n);
  }

  return {
    at(beat) {
      const i = bucket(beat);
      if (i < 0 || i >= buckets.length) return [];
      const out: Note[] = [];
      for (const n of buckets[i]!) {
        if (n.start <= beat && beat < n.start + n.duration) out.push(n);
      }
      return out;
    },
  };
}
