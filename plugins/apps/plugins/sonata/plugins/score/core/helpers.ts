/**
 * Pure `Score` helpers — so no plugin re-implements time math, bar derivation,
 * or merging. All functions are pure: they never mutate their inputs.
 */
import type { Annotation, Score } from "./types";

/** The bpm assumed when a Score declares no tempo map (mirrors `beatToSeconds`). */
const DEFAULT_BPM = 120;

/**
 * Scale playback tempo by `factor` (1 = unchanged, 2 = twice as fast, 0.5 = half
 * speed). Multiplies every tempo segment's bpm, so only the beat↔seconds mapping
 * changes — note onsets/durations and every annotation stay put in beat space.
 * An empty tempoMap materializes the default-bpm segment so scaling still bites.
 * Pure: returns a new Score, never mutates the input.
 */
export function scaleTempo(score: Score, factor: number): Score {
  if (factor === 1) return score;
  const base =
    score.tempoMap.length > 0
      ? score.tempoMap
      : [{ beat: 0, bpm: DEFAULT_BPM }];
  return {
    ...score,
    tempoMap: base.map((e) => ({ ...e, bpm: e.bpm * factor })),
  };
}

/**
 * The largest beat the score references — the transport stops here and the
 * progression bar spans `[0, scoreEndBeat]`. The max over every note's end
 * (`start + duration`) and every annotation's `end`. Pure; never mutates.
 */
export function scoreEndBeat(score: Score): number {
  let end = 0;
  for (const n of score.notes) end = Math.max(end, n.start + n.duration);
  for (const a of score.annotations) end = Math.max(end, a.end);
  return end;
}

/**
 * The previous bar line strictly before `beat` (or 0 when there is none) — so a
 * "seek back" tap rewinds by a whole measure, Synthesia-style: one press lands on
 * the start of the current bar (or the previous bar if already at a bar start),
 * the musically natural "replay this measure" unit. A small epsilon keeps a tap
 * from sticking on the bar line it just landed on. Pure; never mutates.
 */
export function prevBarLine(score: Score, beat: number): number {
  const EPS = 1e-3;
  let best = 0;
  for (const b of bars(score)) {
    if (b.startBeat < beat - EPS && b.startBeat > best) best = b.startBeat;
  }
  return best;
}

/**
 * The next bar line strictly after `beat` (or `scoreEndBeat` when there is none)
 * — the forward counterpart of {@link prevBarLine}. `bars()` is sorted ascending,
 * so the first match is the nearest. Pure; never mutates.
 */
export function nextBarLine(score: Score, beat: number): number {
  const EPS = 1e-3;
  for (const b of bars(score)) {
    if (b.startBeat > beat + EPS) return b.startBeat;
  }
  return scoreEndBeat(score);
}

/**
 * The bar line at or before `beat` — i.e. the start of the bar `beat` falls in
 * (or 0 before the first). Unlike {@link prevBarLine} it is *inclusive*, so a
 * `beat` sitting exactly on a bar line returns that same line. Used to anchor a
 * backward seek to the current bar before stepping, so playback drift past a bar
 * line can't make repeated taps stick on it. Pure; never mutates.
 */
export function currentBarLine(score: Score, beat: number): number {
  const EPS = 1e-3;
  let best = 0;
  for (const b of bars(score)) {
    if (b.startBeat <= beat + EPS && b.startBeat > best) best = b.startBeat;
  }
  return best;
}

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
  const map = score.tempoMap;
  if (map.length === 0) {
    return (beat * 60) / DEFAULT_BPM;
  }

  // `map` is already ascending by beat (the documented Score.tempoMap
  // invariant), so iterate it directly — no clone, no sort.
  const events = map;

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
 * Derive a beat grid from `timeSigMap` and `meta.pickupBeats` — the start beat
 * of each grid cell from the origin to the latest content end. Like `bars()`,
 * but one entry per *beat* (cell) rather than per bar, so chord detection can
 * segment on a fixed musical pulse instead of on raw note onsets/offsets (which
 * fragment arpeggios into a window per note).
 *
 * Cell length (in quarter-note beats) is `(4 / denominator) / subdivisions`:
 * one quarter-note beat by default; `subdivisions = 2` halves it to an eighth
 * grid, etc. In 6/8 the beat is `4/8 = 0.5` quarter-note beats, so the default
 * grid pulses every eighth note — the felt beat of 6/8.
 *
 * Pure; never mutates. A pickup (anacrusis) is cell 0, mirroring `bars()`.
 */
export function beatGrid(
  score: Score,
  subdivisions = 1,
): { index: number; startBeat: number }[] {
  const div = subdivisions > 0 ? subdivisions : 1;

  const maxBeat = scoreEndBeat(score);
  const pickup = score.meta.pickupBeats ?? 0;

  // Default to 4/4 if no time signatures are declared.
  const sigs =
    score.timeSigMap.length > 0
      ? [...score.timeSigMap].sort((a, b) => a.beat - b.beat)
      : [{ beat: 0, numerator: 4, denominator: 4 }];

  const result: { index: number; startBeat: number }[] = [];
  let beat = 0;
  let index = 0;

  // A pickup (anacrusis) is cell 0; the grid then proceeds from the pickup's end.
  if (pickup > 0) {
    result.push({ index, startBeat: 0 });
    index++;
    beat = pickup;
  }

  let sigIdx = 0;
  // Guard against a runaway loop on degenerate (non-positive) cell lengths.
  let guard = 0;
  const GUARD_MAX = 1_000_000;
  while (beat <= maxBeat && guard++ < GUARD_MAX) {
    // Advance to the time signature active at `beat`.
    while (sigIdx + 1 < sigs.length && sigs[sigIdx + 1]!.beat <= beat) sigIdx++;
    const sig = sigs[sigIdx]!;
    const cellLen = (4 / sig.denominator) / div;
    if (cellLen <= 0) break;
    result.push({ index, startBeat: beat });
    index++;
    beat += cellLen;
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
