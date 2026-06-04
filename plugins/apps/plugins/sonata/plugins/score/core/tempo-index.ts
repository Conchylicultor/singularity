/**
 * `TempoIndex` — a precomputed, allocation-free beat↔seconds converter.
 *
 * The pure `beatToSeconds` helper integrates the piecewise-constant `tempoMap`
 * on every call. That's fine for a cold reader, but the transport tick and the
 * piano-roll geometry call it thousands of times per frame. This index does the
 * integration ONCE at build time — a sorted segment list plus a cumulative-
 * seconds prefix sum (`secAtBeat[i] = seconds(events[i].beat)`) — so each lookup
 * is an O(log n) binary search with zero per-call allocation.
 *
 * `seconds(beat)` is piecewise-linear and strictly increasing (bpm > 0), so its
 * inverse `secondsToBeat` is exact closed-form: find the segment whose seconds
 * span contains the query, then invert that segment's linear law. Both
 * directions mirror the segment semantics in `beatToSeconds` (`helpers.ts`)
 * byte-for-byte — including the empty-map and before-first-event edge cases.
 *
 * `scoreEndBeat` is deliberately NOT baked in: the index is a pure tempo↔time
 * map; clamping playback to the song's end is the caller's job.
 */
import type { Score } from "./types";

/** The bpm assumed when a Score declares no tempo map (mirrors `beatToSeconds`). */
const DEFAULT_BPM = 120;

/** A precomputed beat↔seconds converter. Both directions are O(log n). */
export interface TempoIndex {
  /** Beat position → wall-clock seconds. */
  beatToSeconds(beat: number): number;
  /** Wall-clock seconds → beat position (exact closed-form inverse). */
  secondsToBeat(seconds: number): number;
}

/**
 * Build a {@link TempoIndex} from a Score's `tempoMap`. The map is assumed
 * sorted ascending by beat (the documented `Score.tempoMap` invariant). The
 * returned closures allocate nothing and integrate nothing — all integration
 * happens here, once.
 */
export function buildTempoIndex(score: Score): TempoIndex {
  const map = score.tempoMap;

  // Empty map: a single default-bpm segment anchored at beat 0. The forward
  // and inverse laws collapse to the constant-tempo line through the origin.
  if (map.length === 0) {
    const secPerBeat = 60 / DEFAULT_BPM;
    return {
      beatToSeconds: (beat) => beat * secPerBeat,
      secondsToBeat: (seconds) => seconds / secPerBeat,
    };
  }

  // The map is already sorted (Score.tempoMap invariant); read it directly.
  // `beats[i]`/`bpms[i]` are the i-th segment's anchor; `secAtBeat[i]` is the
  // cumulative seconds at that anchor, i.e. seconds(beats[i]).
  const n = map.length;
  const beats = new Array<number>(n);
  const bpms = new Array<number>(n);
  const secAtBeat = new Array<number>(n);

  beats[0] = map[0]!.beat;
  bpms[0] = map[0]!.bpm;
  secAtBeat[0] = 0;
  for (let i = 1; i < n; i++) {
    beats[i] = map[i]!.beat;
    bpms[i] = map[i]!.bpm;
    // seconds(beats[i]) = seconds(beats[i-1]) + (Δbeats) × (60 / prevBpm).
    secAtBeat[i] = secAtBeat[i - 1]! + ((beats[i]! - beats[i - 1]!) * 60) / bpms[i - 1]!;
  }

  const firstBeat = beats[0]!;
  const firstBpm = bpms[0]!;

  return {
    beatToSeconds(beat) {
      // Beats at or before the first event run at the first segment's bpm,
      // extrapolated backwards from that anchor (which sits at 0 seconds).
      if (beat <= firstBeat) {
        return ((beat - firstBeat) * 60) / firstBpm;
      }
      // Find the last segment whose anchor beat is <= `beat` (binary search),
      // then add the partial Δseconds within that segment.
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (beats[mid]! <= beat) lo = mid;
        else hi = mid - 1;
      }
      return secAtBeat[lo]! + ((beat - beats[lo]!) * 60) / bpms[lo]!;
    },

    secondsToBeat(seconds) {
      // Mirror of `beatToSeconds`. `secAtBeat[0]` is 0, so this branch covers
      // seconds <= 0: invert the first segment's backward extrapolation.
      if (seconds <= secAtBeat[0]!) {
        return firstBeat + (seconds * firstBpm) / 60;
      }
      // Find the last segment whose cumulative seconds is <= `seconds`, then
      // invert that segment's linear law: beat = anchor + Δsec × bpm / 60.
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (secAtBeat[mid]! <= seconds) lo = mid;
        else hi = mid - 1;
      }
      return beats[lo]! + ((seconds - secAtBeat[lo]!) * bpms[lo]!) / 60;
    },
  };
}
