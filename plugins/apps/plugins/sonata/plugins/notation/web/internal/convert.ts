/**
 * PURE `Score` → `EngraveModel` converter — the genuinely hard half of the
 * notation lens, kept renderer-free and unit-tested.
 *
 * It turns the polyphonic, beat-based `Score` IR into ordered measures of
 * drawable tickables (chords / rests) per staff, so the VexFlow engraver only has
 * to lay them out. v1 simplifications (documented in CLAUDE.md): one voice per
 * staff with a fixed treble/bass MIDI split, a 1/16 quantization grid, and no
 * tuplets / grace notes.
 *
 * Pipeline per bar, per staff:
 *  1. Bars come from `bars(score)` (pickup + time-sig changes already handled).
 *  2. Notes are quantized to the {@link Q} grid and clipped to the bar.
 *  3. The bar is walked in Q-steps; a *run* is a maximal span over which the set
 *     of sounding notes is constant. An empty set is a rest; a non-empty set is a
 *     chord (all its notes share the run, by construction).
 *  4. Each run's length is decomposed (durations.ts) into tied notation pieces.
 *  5. A note continuing past the barline ties its bar's final piece to the next
 *     tickable (the continuation in the following bar).
 */
import {
  bars,
  effectiveKeyAt,
  makeKeySpeller,
  scoreEndBeat,
  type ChordAnnotation,
  type KeySignature,
  type PitchSpelling,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { decomposeDuration, Q } from "./durations";

/** One drawable tickable — a chord (≥1 key) or a rest (`isRest`). */
export interface EngTickable {
  /** Absolute start beat — feeds the BeatIndex (playhead / highlight / seek). */
  beat: number;
  /** VexFlow keys, e.g. `["c#/4", "e/4"]`. For a rest, a single placement key. */
  keys: string[];
  /** VexFlow base duration token ("w" | "h" | "q" | "8" | "16"). */
  duration: string;
  /** Augmentation dots (0–2), applied via `Dot.buildAndAttach` at draw time. */
  dots: number;
  /** Length in quarter-note beats this tickable occupies (for highlight ranges). */
  beats: number;
  /** Whether this is a rest (drawn with the `"r"` suffix). */
  isRest: boolean;
  /** Tied into the following tickable in this staff's flat sequence. */
  tieToNext: boolean;
  /** Per-key chromatic alteration, parallel to `keys` (for explicit accidentals). */
  alters: number[];
}

/** One engraved measure: its two staves plus header metadata. */
export interface EngMeasure {
  index: number;
  startBeat: number;
  timeSig: { numerator: number; denominator: number };
  /** VexFlow key-signature name for this measure (e.g. "C", "Bb", "F#m"). */
  keyName: string;
  /** Whether `keyName` differs from the previous measure (draw a new key sig). */
  keyChanged: boolean;
  treble: EngTickable[];
  bass: EngTickable[];
  /** Chord symbol anchored to the measure start, when `showChordSymbols`. */
  chordSymbol?: string;
}

/** The full engraving input: ordered measures + the treble/bass split pitch. */
export interface EngraveModel {
  measures: EngMeasure[];
  clefSplit: number;
}

export interface ConvertOptions {
  /** MIDI pitch at/above which a note goes to the treble staff (default 60). */
  splitPitch: number;
  /** Whether to attach per-measure chord symbols. */
  showChordSymbols: boolean;
}

const EPS = 1e-6;

/** Quantize a beat value to the {@link Q} (sixteenth-note) grid. */
function quantize(x: number): number {
  return Math.round(x / Q) * Q;
}

/** Rest placement keys — the middle of each staff, so rests sit centered. */
const REST_KEY = { treble: "b/4", bass: "d/3" } as const;

/** VexFlow accepts these key-signature names; anything else falls back to "C". */
const VEXFLOW_KEYS = new Set<string>([
  // Major
  "C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb",
  // Minor
  "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m",
  "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm",
]);

/** A `KeySignature` → a VexFlow key-sig name, normalized and allowlist-guarded. */
export function vexflowKeyName(key: KeySignature | undefined): string {
  if (!key) return "C";
  const tonic = key.tonic.replace(/♯/g, "#").replace(/♭/g, "b");
  const name = tonic + (key.mode === "minor" ? "m" : "");
  return VEXFLOW_KEYS.has(name) ? name : "C";
}

/** Chromatic alteration → VexFlow accidental characters embedded in a key string. */
function accidentalChars(alter: number): string {
  if (alter === 0) return "";
  return (alter > 0 ? "#" : "b").repeat(Math.abs(alter));
}

/** A spelled pitch → a VexFlow key string, e.g. `{C,#,4}` → `"c#/4"`. */
function keyOf(spelling: PitchSpelling): string {
  return `${spelling.step.toLowerCase()}${accidentalChars(spelling.alter)}/${spelling.octave}`;
}

/** A note clipped to a bar, with quantized bounds and its true (unclipped) end. */
interface Seg {
  id: string;
  pitch: number;
  spelling: PitchSpelling;
  /** Quantized start clipped to the bar. */
  qs: number;
  /** Quantized end clipped to the bar. */
  qe: number;
  /** Quantized end BEFORE clipping — > barEnd means the note crosses the barline. */
  fullEnd: number;
}

/** Build the tickable sequence for one staff within one bar. */
function buildBarStaff(
  segs: Seg[],
  barStart: number,
  barEnd: number,
): EngTickable[] {
  const numCells = Math.max(0, Math.round((barEnd - barStart) / Q));
  if (numCells === 0) return [];

  // Per-cell sounding-note id set, as a stable string key for run grouping.
  const cellIds: string[][] = [];
  for (let k = 0; k < numCells; k++) {
    const cb = barStart + k * Q;
    const ids = segs
      .filter((s) => s.qs <= cb + EPS && s.qe >= cb + Q - EPS)
      .map((s) => s.id);
    cellIds.push(ids);
  }
  const keyFor = (ids: string[]) => ids.slice().sort().join(",");

  const out: EngTickable[] = [];
  let cell = 0;
  while (cell < numCells) {
    const runKey = keyFor(cellIds[cell]!);
    let runLen = 1;
    while (cell + runLen < numCells && keyFor(cellIds[cell + runLen]!) === runKey) {
      runLen++;
    }
    const ids = cellIds[cell]!;
    const runStartBeat = barStart + cell * Q;
    const runEndCell = cell + runLen;
    const runBeats = runLen * Q;
    const pieces = decomposeDuration(runBeats);

    if (ids.length === 0) {
      // A rest run — one rest tickable per decomposed piece (rests never tie).
      // The placement key is filled per-staff by `withRestKeys`.
      pieces.forEach((p, i) => {
        out.push({
          beat: runStartBeat + offsetBeats(pieces, i),
          keys: [], // filled by the caller (it knows treble vs bass)
          duration: p.duration,
          dots: p.dots,
          beats: p.beats,
          isRest: true,
          tieToNext: false,
          alters: [0],
        });
      });
    } else {
      // A chord run — its notes (sorted low→high) share every piece; pieces tie.
      const chord = segs
        .filter((s) => ids.includes(s.id))
        .sort((a, b) => a.pitch - b.pitch);
      const keys = chord.map((s) => keyOf(s.spelling));
      const alters = chord.map((s) => s.spelling.alter);
      const continuesPastBar =
        runEndCell === numCells && chord.some((s) => s.fullEnd > barEnd + EPS);
      pieces.forEach((p, i) => {
        const isLastPiece = i === pieces.length - 1;
        out.push({
          beat: runStartBeat + offsetBeats(pieces, i),
          keys: [...keys],
          duration: p.duration,
          dots: p.dots,
          beats: p.beats,
          isRest: false,
          // Tie to the next piece (same chord) or, on the final piece, to the
          // continuation in the next bar.
          tieToNext: isLastPiece ? continuesPastBar : true,
          alters: [...alters],
        });
      });
    }
    cell = runEndCell;
  }
  return out;
}

/** Cumulative beat offset of piece `i` within a decomposed run. */
function offsetBeats(pieces: { beats: number }[], i: number): number {
  let sum = 0;
  for (let j = 0; j < i; j++) sum += pieces[j]!.beats;
  return sum;
}

/**
 * Convert a `Score` into an `EngraveModel`: ordered measures, each with a treble
 * and bass tickable sequence, key/time-signature metadata, and optional chord
 * symbols. Pure — never mutates the input.
 */
export function convert(score: Score, opts: ConvertOptions): EngraveModel {
  const { splitPitch, showChordSymbols } = opts;
  const barList = bars(score);
  const end = scoreEndBeat(score);
  const sigs =
    score.timeSigMap.length > 0
      ? [...score.timeSigMap].sort((a, b) => a.beat - b.beat)
      : [{ beat: 0, numerator: 4, denominator: 4 }];

  const chords = score.annotations.filter(
    (a): a is ChordAnnotation => a.type === "chord",
  );

  const measures: EngMeasure[] = [];
  let prevKeyName: string | null = null;

  for (let i = 0; i < barList.length; i++) {
    const barStart = barList[i]!.startBeat;
    // Time signature in force at the bar start.
    let sig = sigs[0]!;
    for (const s of sigs) {
      if (s.beat <= barStart + EPS) sig = s;
      else break;
    }
    const barLen = sig.numerator * (4 / sig.denominator);
    const barEnd = barList[i + 1]?.startBeat ?? Math.max(barStart + barLen, end);

    const keyName = vexflowKeyName(
      effectiveKeyAt(score, barStart) ?? score.meta.key,
    );
    const speller = makeKeySpeller(
      effectiveKeyAt(score, barStart) ?? score.meta.key,
    );

    const trebleSegs: Seg[] = [];
    const bassSegs: Seg[] = [];
    for (const n of score.notes) {
      const qs = Math.max(barStart, quantize(n.start));
      const fullEnd = quantize(n.start + n.duration);
      const qe = Math.min(barEnd, fullEnd);
      if (qe - qs < Q - EPS) continue; // no representable overlap with this bar.
      const seg: Seg = {
        id: n.id,
        pitch: n.pitch,
        spelling: n.spelling ?? speller.spell(n.pitch),
        qs,
        qe,
        fullEnd,
      };
      (n.pitch >= splitPitch ? trebleSegs : bassSegs).push(seg);
    }

    const treble = withRestKeys(
      buildBarStaff(trebleSegs, barStart, barEnd),
      "treble",
    );
    const bass = withRestKeys(buildBarStaff(bassSegs, barStart, barEnd), "bass");

    let chordSymbol: string | undefined;
    if (showChordSymbols) {
      const c = chords.find(
        (a) => a.start >= barStart - EPS && a.start < barEnd - EPS,
      );
      if (c) chordSymbol = c.data.spelledSymbol ?? c.data.symbol;
    }

    measures.push({
      index: barList[i]!.index,
      startBeat: barStart,
      timeSig: { numerator: sig.numerator, denominator: sig.denominator },
      keyName,
      keyChanged: prevKeyName !== null && keyName !== prevKeyName,
      treble,
      bass,
      chordSymbol,
    });
    prevKeyName = keyName;
  }

  // `bars()` emits a trailing bar when content ends exactly on a barline; drop
  // any trailing measures that are pure rests with no chord symbol so the score
  // doesn't end on a spurious empty measure. Interior rest measures stay.
  while (measures.length > 1) {
    const last = measures.at(-1)!;
    const allRests =
      last.treble.every((t) => t.isRest) && last.bass.every((t) => t.isRest);
    if (allRests && last.chordSymbol === undefined) measures.pop();
    else break;
  }

  return { measures, clefSplit: splitPitch };
}

/** Fill rest tickables' placement key for the given staff (chords already have keys). */
function withRestKeys(
  tickables: EngTickable[],
  staff: "treble" | "bass",
): EngTickable[] {
  for (const t of tickables) {
    if (t.isRest) t.keys = [REST_KEY[staff]];
  }
  return tickables;
}
