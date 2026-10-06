/**
 * Chord templates and per-beat emission scores.
 *
 * A chord symbol becomes a {@link ChordShape} — its pitch classes relative to
 * the root plus its bass — via theory's own parser, so the aligner reads chord
 * symbols exactly the way the rest of Sonata does (`ChordData.intervals` for an
 * altered chord, else the quality's intervals; a slash bass when present).
 *
 * A shape at a given absolute root is a 12-bin template, centred and
 * unit-normalised; a beat's chroma is centred and unit-normalised too, so their
 * dot product is a Pearson correlation in [-1, 1]: 0 for chroma that says
 * nothing about the chord, regardless of how loud or flat it is.
 */

import type { Beat } from "@plugins/infra/plugins/audio-analysis/core";
import {
  parseChordSymbol,
  qualityToIntervals,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";

/** A chord's pitch content, independent of its root. */
export interface ChordShape {
  /** Root pitch class at sheet pitch (0 = C). */
  root: number;
  /** Chord tones as semitones above the root, mod 12, ascending, 0 included. */
  tones: readonly number[];
  /** The bass, in semitones above the root (0 unless a slash chord). */
  bass: number;
}

/** Template weight of the root, above the other tones. */
const ROOT_WEIGHT = 1;
/** Template weight of the third and the fifth. */
const TRIAD_WEIGHT = 0.8;
/** Template weight of every other tone (sevenths, extensions, adds). */
const COLOUR_WEIGHT = 0.6;

const pc12 = (pc: number): number => ((pc % 12) + 12) % 12;

/** The shape of a chord symbol, or `null` for one theory does not recognise (`N.C.`). */
export function chordShape(symbol: string): ChordShape | null {
  const data = parseChordSymbol(symbol);
  if (data === null) return null;
  const intervals = data.intervals ?? qualityToIntervals(data.quality);
  const tones = [...new Set([0, ...intervals.map(pc12)])].sort((a, b) => a - b);
  return {
    root: data.root,
    tones,
    bass: data.bass === undefined ? 0 : pc12(data.bass - data.root),
  };
}

/** A stable key for deduplicating shapes: same key ⇒ same template at every transposition. */
export function shapeKey(shape: ChordShape): string {
  return `${shape.root}:${shape.tones.join(".")}/${shape.bass}`;
}

/** Centre a 12-vector and scale it to unit length; a flat vector becomes all zeros. */
export function centredUnit(v: ArrayLike<number>): Float64Array {
  let mean = 0;
  for (let i = 0; i < 12; i++) mean += v[i]!;
  mean /= 12;
  const out = new Float64Array(12);
  let norm = 0;
  for (let i = 0; i < 12; i++) {
    const x = v[i]! - mean;
    out[i] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm);
  if (norm < 1e-9) return new Float64Array(12);
  for (let i = 0; i < 12; i++) out[i]! /= norm;
  return out;
}

/** The centred unit template of `tones` with its root on absolute pitch class `root`. */
export function toneTemplate(
  tones: readonly number[],
  root: number,
): Float64Array {
  const raw = new Array<number>(12).fill(0);
  for (const t of tones) {
    const w =
      t === 0
        ? ROOT_WEIGHT
        : t === 3 || t === 4 || t === 7
          ? TRIAD_WEIGHT
          : COLOUR_WEIGHT;
    raw[pc12(root + t)] = w;
  }
  return centredUnit(raw);
}

/** Dot product of two 12-vectors. */
export function dot12(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < 12; i++) s += a[i]! * b[i]!;
  return s;
}

/** A beat's chroma prepared once for every template comparison. */
export interface PreparedBeat {
  /** Centred unit treble chroma. */
  chroma: Float64Array;
  /** Bass chroma minus its mean, per pitch class (≈ -0.5 … 1). */
  bass: Float64Array;
  rms: number;
}

export function prepareBeat(beat: Beat): PreparedBeat {
  let mean = 0;
  for (let i = 0; i < 12; i++) mean += beat.bass[i]!;
  mean /= 12;
  const bass = new Float64Array(12);
  for (let i = 0; i < 12; i++) bass[i] = beat.bass[i]! - mean;
  return { chroma: centredUnit(beat.chroma), bass, rms: beat.rms };
}

/**
 * The 24 major and minor triads at every root: the generic vocabulary a path
 * chord's emission is compared against for its confidence margin.
 */
export const TRIAD_VOCABULARY: readonly {
  pcs: number;
  template: Float64Array;
}[] = (() => {
  const out: { pcs: number; template: Float64Array }[] = [];
  for (const tones of [
    [0, 4, 7],
    [0, 3, 7],
  ]) {
    for (let root = 0; root < 12; root++) {
      out.push({
        pcs: pcMask(tones, root),
        template: toneTemplate(tones, root),
      });
    }
  }
  return out;
})();

/** A 12-bit mask of the absolute pitch classes `tones` cover with the root on `root`. */
export function pcMask(tones: readonly number[], root: number): number {
  let m = 0;
  for (const t of tones) m |= 1 << pc12(root + t);
  return m;
}
