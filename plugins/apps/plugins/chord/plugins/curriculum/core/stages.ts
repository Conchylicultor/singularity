import { z } from "zod";
import {
  chordTokenFromParts,
  parseChordToken,
  type ChordToken,
  type ChordTokenParts,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";

// ── Stages: the families a chord can come from ───────────────────────────────
//
// A stage is a family of chords — major-key triads, minor keys, sevenths,
// inversions. It only says what a chord IS; which chords the learner practises,
// and in what order the path suggests them, is `path.ts`.
//
// Membership is by predicate over the token's parts, and the FIRST stage of
// `STAGES` whose predicate matches owns the chord. So a chord nobody thought
// of still lands in exactly one family.

export const STAGE_IDS = [
  "major-triads",
  "minor-keys",
  "sevenths",
  "inversions",
  "secondary",
  "colour",
  "mixolydian",
  "dorian",
  "lydian",
  "phrygian",
] as const;
export type StageId = (typeof STAGE_IDS)[number];
export const StageIdSchema = z.enum(STAGE_IDS);

export type Stage = {
  id: StageId;
  /** The family's name: "Minor keys". */
  title: string;
  /**
   * Whether this chord belongs to the stage.
   *
   * `known` is a set of chords the caller treats as known: the inversions
   * stage reads it, because an inversion is only in the family once its
   * root-position twin is. Pure — the same arguments always give the same answer.
   */
  holds(parts: ChordTokenParts, known: ReadonlySet<ChordToken>): boolean;
};

// ── Reading a chord against the scales ───────────────────────────────────────

/** Semitones above the tonic of the major scale's seven degrees. */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;
/** The same for the natural minor scale. */
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10] as const;

/** A root-position chord's shape, as one comparable string: "7:4-3-3". */
const shapeKey = (root: number, intervals: readonly number[]): string =>
  `${root}:${intervals.join("-")}`;

/** The stacked-thirds chord on one degree of a scale, as a token's intervals. */
function diatonicIntervals(
  scale: readonly number[],
  degree: number,
  tones: number,
): number[] {
  const pitches: number[] = [];
  for (let tone = 0; tone < tones; tone++) {
    const step = degree + 2 * tone;
    const above = scale[step % scale.length];
    if (above === undefined) throw new Error("a scale degree is 0…6");
    pitches.push(above + 12 * Math.floor(step / scale.length));
  }
  const intervals: number[] = [];
  for (let tone = 1; tone < pitches.length; tone++) {
    const upper = pitches[tone];
    const lower = pitches[tone - 1];
    if (upper === undefined || lower === undefined) {
      throw new Error("a stack has a tone below each of its tones");
    }
    intervals.push(upper - lower);
  }
  return intervals;
}

/** Every chord of `tones` tones the scale builds on its own degrees, by shape. */
function diatonicShapes(
  scale: readonly number[],
  tones: number,
): ReadonlySet<string> {
  const shapes = new Set<string>();
  for (let degree = 0; degree < scale.length; degree++) {
    const root = scale[degree];
    if (root === undefined) throw new Error("a scale degree is 0…6");
    shapes.add(shapeKey(root, diatonicIntervals(scale, degree, tones)));
  }
  return shapes;
}

/** I ii iii IV V vi vii°, in root position. */
const MAJOR_TRIAD_SHAPES = diatonicShapes(MAJOR_SCALE, 3);
/** i ii° ♭III iv v ♭VI ♭VII, in root position. */
const MINOR_TRIAD_SHAPES = diatonicShapes(NATURAL_MINOR, 3);
/** The seventh chord each scale builds on each of its degrees: V7, Imaj7, ii7, viiø7, … */
const DIATONIC_SEVENTH_SHAPES: ReadonlySet<string> = new Set([
  ...diatonicShapes(MAJOR_SCALE, 4),
  ...diatonicShapes(NATURAL_MINOR, 4),
]);

const MAJOR_TRIAD = [4, 3];
const DOMINANT_SEVENTH = [4, 3, 3];

const sameStack = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((interval, i) => interval === b[i]);

const rootPosition = (parts: ChordTokenParts) => parts.inversion === 0;
const shapeOf = (parts: ChordTokenParts) =>
  shapeKey(parts.root, parts.intervals);

// ── The stages ───────────────────────────────────────────────────────────────

/**
 * Every stage, in classification order. A chord belongs to the first one that
 * holds it, so the order decides the borderline cases:
 *
 * - a triad of the major scale is a major-key triad, never a minor-key one
 *   (only ♭III iv v ii° i and the other minor-scale triads fall through);
 * - a seventh the scales themselves build (V7, ii7, Imaj7) is a seventh, while
 *   a dominant seventh they do not build (I7, the V7 of another degree) falls
 *   through to `secondary`;
 * - an inversion is an inversion, whatever its stack is;
 * - a major triad or dominant seventh on a degree that does not have one is a
 *   secondary dominant;
 * - everything else in root position is colour: sus, sixths, added notes.
 *
 * The modal stages hold no chord at all — they are key modes, and the chords
 * heard in them are ones the learner already knows.
 */
export const STAGES: readonly Stage[] = [
  {
    id: "major-triads",
    title: "Major keys",
    holds: (parts) =>
      rootPosition(parts) && MAJOR_TRIAD_SHAPES.has(shapeOf(parts)),
  },
  {
    id: "minor-keys",
    title: "Minor keys",
    holds: (parts) =>
      rootPosition(parts) && MINOR_TRIAD_SHAPES.has(shapeOf(parts)),
  },
  {
    id: "sevenths",
    title: "Sevenths",
    holds: (parts) =>
      rootPosition(parts) && DIATONIC_SEVENTH_SHAPES.has(shapeOf(parts)),
  },
  {
    id: "inversions",
    title: "Inversions",
    // Only once the same chord in root position is known: naming a V⁶ before a
    // V is two notions at once. A chord whose twin is missing belongs to no
    // family at all.
    holds: (parts, known) =>
      parts.inversion > 0 &&
      known.has(chordTokenFromParts({ ...parts, inversion: 0 })),
  },
  {
    id: "secondary",
    title: "Secondary dominants",
    holds: (parts) =>
      rootPosition(parts) &&
      (sameStack(parts.intervals, MAJOR_TRIAD) ||
        sameStack(parts.intervals, DOMINANT_SEVENTH)),
  },
  {
    id: "colour",
    title: "Colour chords",
    holds: rootPosition,
  },
  {
    id: "mixolydian",
    title: "Mixolydian",
    holds: () => false,
  },
  {
    id: "dorian",
    title: "Dorian",
    holds: () => false,
  },
  {
    id: "lydian",
    title: "Lydian",
    holds: () => false,
  },
  {
    id: "phrygian",
    title: "Phrygian",
    holds: () => false,
  },
];

/** The stage with this id. Throws when there is none. */
export function stageById(id: StageId): Stage {
  const stage = STAGES.find((s) => s.id === id);
  if (stage === undefined) throw new Error(`No stage "${id}"`);
  return stage;
}

/**
 * The stage this chord belongs to, or `null` when none holds it — an
 * inversion whose root-position twin is not in `known`.
 */
export function stageOf(
  token: ChordToken,
  known: ReadonlySet<ChordToken>,
): StageId | null {
  const parts = parseChordToken(token);
  return STAGES.find((stage) => stage.holds(parts, known))?.id ?? null;
}
