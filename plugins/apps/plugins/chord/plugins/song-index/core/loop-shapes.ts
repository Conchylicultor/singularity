import {
  hookpadKeyAt,
  hookpadTonicPc,
  type HookpadKey,
  type HookpadMeter,
  type HookpadMode,
} from "@plugins/integrations/plugins/hooktheory/core";
import { CHORD_FEATURES, type ChordFeature } from "./features";
import type { IndexedChord } from "./indexed-chord";
import type { ChordToken } from "./token";

// ── Loop shapes: which spans of a section the trainer can loop ───────────────
//
// A closed list of plain data plus a pure enumerator. A new shape ("bars-2",
// "phrase-8") is a new entry here and an `INDEX_DERIVATION_VERSION` bump; the
// tables need no change.

export const LOOP_SHAPE_IDS = ["bars-4"] as const;
export type LoopShapeId = (typeof LOOP_SHAPE_IDS)[number];

/** The shape a read uses when the caller names none — the one the trainer plays. */
export const DEFAULT_LOOP_SHAPE: LoopShapeId = "bars-4";

/** What a loop shape reads of a section. Beats are Hookpad's, 1-based. */
export type LoopSectionInput = {
  chords: readonly IndexedChord[];
  keys: readonly HookpadKey[];
  meters: readonly HookpadMeter[];
  endBeat: number;
};

/** One loopable span, with what the trainer filters and ranks on. */
export type LoopWindow = {
  shape: LoopShapeId;
  /** First beat of the loop (a bar start), inclusive. */
  startBeat: number;
  /** Beat the loop ends on, exclusive. */
  endBeat: number;
  bars: number;
  beatsPerBar: number;
  beatUnit: number;
  /** The one key the whole window is in, as spelled by the document's key. */
  keyTonic: string;
  keyMode: HookpadMode;
  /** The distinct tokens sounding in the window, in order of first appearance. */
  chordTokens: ChordToken[];
  /** The union of the sounding chords' spelling features, in `CHORD_FEATURES` order. */
  features: ChordFeature[];
  /** Sounding chords overlapping the window (one that started before it and rings into it counts). */
  chordCount: number;
  /** Chord changes inside the window: sounding chords starting after its first beat with a token different from the previous sounding chord's. Rests are ignored. */
  changeCount: number;
  /** Whether the harmony is silent anywhere in the window: a rest, or a gap no chord covers. */
  hasRest: boolean;
  /** Whether a sounding chord starts exactly on the window's first beat. */
  startsOnChange: boolean;
};

export type LoopShape = {
  id: LoopShapeId;
  enumerate(section: LoopSectionInput): LoopWindow[];
};

/** Tolerance for comparing beats: absorbs floating-point drift in old documents. */
const BEAT_EPS = 1e-6;

/**
 * Whether a chord sounding from `beat` for `duration` is inside the window
 * `[start, end)` — the ONE overlap rule of the index.
 *
 * A window's `chordTokens`, `features`, `chordCount` and `changeCount` are
 * derived from it, and a read hands back the section's chords it keeps. Both
 * sides call this, because a rule spelled twice (here with the tolerance, there
 * without) lets a read return a chord the window never counted — a token the
 * window's `chord_tokens` does not list, which is what "every chord of the
 * window is unlocked" rests on.
 */
export function chordOverlapsWindow(
  chord: { beat: number; duration: number },
  start: number,
  end: number,
): boolean {
  return (
    chord.beat < end - BEAT_EPS &&
    chord.beat + chord.duration > start + BEAT_EPS
  );
}

/** `hookpadKeyAt`'s tolerance, used for a key change inside a window. */
const KEY_EPS = 1e-3;

function sameKey(a: HookpadKey, b: HookpadKey): boolean {
  return (
    a.scale === b.scale && hookpadTonicPc(a.tonic) === hookpadTonicPc(b.tonic)
  );
}

/**
 * The windows of `bars` whole bars, one per bar start. A window lies inside
 * one meter (a meter change cuts the bars), inside one key (no change to a
 * different key strictly inside it, and every chord sounding in it is read in
 * that key), and fully inside the section. A window where nothing sounds is
 * left out: no query could ever match it.
 */
function enumerateBars(
  shape: LoopShapeId,
  bars: number,
  section: LoopSectionInput,
): LoopWindow[] {
  const windows: LoopWindow[] = [];
  const chords = [...section.chords].sort(
    (a, b) => a.chord.beat - b.chord.beat,
  );
  section.meters.forEach((meter, i) => {
    if (!(meter.numBeats > 0)) {
      throw new Error(
        `A meter of ${meter.numBeats} beats per bar (at beat ${meter.beat}) cannot be cut into bars`,
      );
    }
    const next = section.meters[i + 1];
    if (next !== undefined && next.beat <= meter.beat) {
      throw new Error(
        `Meters out of beat order: beat ${next.beat} listed after beat ${meter.beat}`,
      );
    }
    const meterEnd = Math.min(next?.beat ?? section.endBeat, section.endBeat);
    const length = bars * meter.numBeats;
    for (
      let start = meter.beat;
      start + length <= meterEnd + BEAT_EPS;
      start += meter.numBeats
    ) {
      const window = barsWindow(
        shape,
        bars,
        meter,
        start,
        start + length,
        chords,
        section.keys,
      );
      if (window !== undefined) windows.push(window);
    }
  });
  return windows;
}

/** One candidate window, or `undefined` when it breaks a rule of the shape (a different key inside, nothing sounding). */
function barsWindow(
  shape: LoopShapeId,
  bars: number,
  meter: HookpadMeter,
  start: number,
  end: number,
  chordsByBeat: readonly IndexedChord[],
  keys: readonly HookpadKey[],
): LoopWindow | undefined {
  const keyAtStart = hookpadKeyAt(keys, start);
  if (keyAtStart.kind === "before-first-key") return undefined;
  const key = keyAtStart.key;
  const keyChangesInside = keys.filter(
    (k) => k.beat >= start + KEY_EPS && k.beat < end - KEY_EPS,
  );
  if (!keyChangesInside.every((k) => sameKey(k, key))) return undefined;

  const overlapping = chordsByBeat.filter((c) =>
    chordOverlapsWindow(c.chord, start, end),
  );
  const sounding = overlapping.flatMap((c) =>
    c.reading.kind === "sound" ? [{ ...c, reading: c.reading }] : [],
  );
  if (sounding.length === 0) return undefined;
  if (!sounding.every((c) => sameKey(c.key, key))) return undefined;

  const tokens: ChordToken[] = [];
  const features = new Set<ChordFeature>();
  let changeCount = 0;
  let previous: ChordToken | undefined;
  for (const c of sounding) {
    if (!tokens.includes(c.reading.token)) tokens.push(c.reading.token);
    for (const f of c.reading.features) features.add(f);
    if (
      previous !== undefined &&
      c.chord.beat > start + BEAT_EPS &&
      c.reading.token !== previous
    ) {
      changeCount++;
    }
    previous = c.reading.token;
  }

  return {
    shape,
    startBeat: start,
    endBeat: end,
    bars,
    beatsPerBar: meter.numBeats,
    beatUnit: meter.beatUnit,
    keyTonic: key.tonic,
    keyMode: key.scale,
    chordTokens: tokens,
    features: CHORD_FEATURES.filter((f) => features.has(f)),
    chordCount: sounding.length,
    changeCount,
    hasRest: harmonyIsSilentSomewhere(overlapping, start, end),
    startsOnChange: sounding.some(
      (c) => Math.abs(c.chord.beat - start) <= BEAT_EPS,
    ),
  };
}

/** A rest overlaps the span, or some part of it is covered by no chord at all. */
function harmonyIsSilentSomewhere(
  overlappingByBeat: readonly IndexedChord[],
  start: number,
  end: number,
): boolean {
  if (overlappingByBeat.some((c) => c.reading.kind === "rest")) return true;
  let coveredUntil = start;
  for (const { chord } of overlappingByBeat) {
    if (chord.beat > coveredUntil + BEAT_EPS) return true;
    coveredUntil = Math.max(coveredUntil, chord.beat + chord.duration);
  }
  return coveredUntil < end - BEAT_EPS;
}

export const LOOP_SHAPES: Readonly<Record<LoopShapeId, LoopShape>> = {
  "bars-4": {
    id: "bars-4",
    enumerate: (section) => enumerateBars("bars-4", 4, section),
  },
};
