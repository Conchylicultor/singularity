/**
 * Pure `Score` helpers — so no plugin re-implements time math, bar derivation,
 * or merging. All functions are pure: they never mutate their inputs.
 */
import type { Annotation, Score } from "./types";

/** An empty Score — the shell's default before any source loads. */
export function emptyScore(): Score {
  return {
    meta: {},
    tracks: [],
    tempoMap: [],
    timeSigMap: [],
    notes: [],
    annotations: [],
  };
}

/**
 * Convert a beat position to wall-clock seconds, integrating the piecewise-
 * constant `tempoMap`. Each tempo segment spans from its `beat` until the next
 * event's `beat` (or +∞). Beats before the first event use the first segment's
 * bpm (or a 120 bpm default when the map is empty).
 *
 * seconds(beat) = Σ over segments of (Δbeats in segment) × (60 / bpm).
 */
export function beatToSeconds(score: Score, beat: number): number {
  const DEFAULT_BPM = 120;
  const map = score.tempoMap;
  if (map.length === 0) {
    return (beat * 60) / DEFAULT_BPM;
  }

  // Ensure ascending by beat without mutating the source.
  const events = [...map].sort((a, b) => a.beat - b.beat);

  const firstBeat = events[0]!.beat;
  const firstBpm = events[0]!.bpm;

  // Beats at or before the first event run at the first segment's bpm
  // (extrapolated backwards relative to that event's anchor).
  if (beat <= firstBeat) {
    return ((beat - firstBeat) * 60) / firstBpm;
  }

  let seconds = 0;
  let prevBeat = firstBeat;
  let prevBpm = firstBpm;

  for (let i = 1; i < events.length; i++) {
    const segEnd = events[i]!.beat;
    if (beat <= segEnd) {
      seconds += ((beat - prevBeat) * 60) / prevBpm;
      return seconds;
    }
    seconds += ((segEnd - prevBeat) * 60) / prevBpm;
    prevBeat = segEnd;
    prevBpm = events[i]!.bpm;
  }

  // Past the last event: extend the final segment's bpm to +∞.
  seconds += ((beat - prevBeat) * 60) / prevBpm;
  return seconds;
}

/**
 * Derive bar boundaries from `timeSigMap` and `meta.pickupBeats`. Bars are never
 * stored on notes (that desyncs); always derive them. Returns the start beat of
 * each bar covering the span of the score's notes/annotations.
 *
 * Bar length (in quarter-note beats) for a time signature n/d is
 * `n × (4 / d)` (e.g. 6/8 → 6 × 0.5 = 3 quarter-note beats).
 */
export function bars(score: Score): { index: number; startBeat: number }[] {
  // Span to cover: from the origin to the latest content end.
  let maxBeat = 0;
  for (const n of score.notes) maxBeat = Math.max(maxBeat, n.start + n.duration);
  for (const a of score.annotations) maxBeat = Math.max(maxBeat, a.end);

  const pickup = score.meta.pickupBeats ?? 0;

  // Default to 4/4 if no time signatures are declared.
  const sigs =
    score.timeSigMap.length > 0
      ? [...score.timeSigMap].sort((a, b) => a.beat - b.beat)
      : [{ beat: 0, numerator: 4, denominator: 4 }];

  const result: { index: number; startBeat: number }[] = [];
  let beat = 0;
  let index = 0;

  // A pickup (anacrusis) is bar 0; the first full bar begins at the pickup's end.
  if (pickup > 0) {
    result.push({ index, startBeat: 0 });
    index++;
    beat = pickup;
  }

  let sigIdx = 0;
  // Guard against a runaway loop on degenerate (non-positive) bar lengths.
  let guard = 0;
  const GUARD_MAX = 1_000_000;
  while (beat <= maxBeat && guard++ < GUARD_MAX) {
    // Advance to the time signature active at `beat`.
    while (sigIdx + 1 < sigs.length && sigs[sigIdx + 1]!.beat <= beat) sigIdx++;
    const sig = sigs[sigIdx]!;
    const barLen = sig.numerator * (4 / sig.denominator);
    if (barLen <= 0) break;
    result.push({ index, startBeat: beat });
    index++;
    beat += barLen;
  }

  return result;
}

/**
 * Merge several Scores into one, namespacing each layer's track and note ids by
 * its layer index so identities never collide, and unioning annotations (with
 * their targets remapped to the namespaced note ids). Sources stay independent
 * and pure — none knows about merging. The Score is what's mergeable, not the
 * sources.
 */
export function mergeScores(scores: Score[]): Score {
  if (scores.length === 0) return emptyScore();
  if (scores.length === 1) return scores[0]!;

  const out = emptyScore();
  // Take title/key/pickup from the first score that declares each.
  for (const s of scores) {
    if (out.meta.title === undefined && s.meta.title !== undefined)
      out.meta.title = s.meta.title;
    if (out.meta.key === undefined && s.meta.key !== undefined)
      out.meta.key = s.meta.key;
    if (out.meta.pickupBeats === undefined && s.meta.pickupBeats !== undefined)
      out.meta.pickupBeats = s.meta.pickupBeats;
  }
  // Tempo / time-sig maps come from the first score that has them — overlaying
  // independent tempo maps is ill-defined, so we don't guess.
  for (const s of scores) {
    if (out.tempoMap.length === 0 && s.tempoMap.length > 0)
      out.tempoMap = [...s.tempoMap];
    if (out.timeSigMap.length === 0 && s.timeSigMap.length > 0)
      out.timeSigMap = [...s.timeSigMap];
  }

  scores.forEach((s, layer) => {
    const ns = (id: string) => `L${layer}:${id}`;
    for (const t of s.tracks) out.tracks.push({ ...t, id: ns(t.id) });
    for (const n of s.notes)
      out.notes.push({ ...n, id: ns(n.id), track: ns(n.track) });
    for (const a of s.annotations) {
      const target = a.target
        ? {
            ...a.target,
            noteIds: a.target.noteIds?.map(ns),
            track: a.target.track !== undefined ? ns(a.target.track) : undefined,
          }
        : undefined;
      out.annotations.push({ ...a, target });
    }
  });

  return out;
}

/**
 * Append analyzer-derived annotations to a Score without ever clobbering
 * authored truth. Returns a new Score; the base is left untouched. Derived
 * annotations are appended after authored ones.
 */
export function mergeAnnotations(
  base: Score,
  derived: Annotation[],
): Score {
  if (derived.length === 0) return base;
  return {
    ...base,
    annotations: [...base.annotations, ...derived],
  };
}
