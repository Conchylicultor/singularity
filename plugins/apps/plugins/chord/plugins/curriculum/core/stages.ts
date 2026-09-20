import { z } from "zod";
import {
  chordTokenFromParts,
  parseChordToken,
  type ChordToken,
  type ChordTokenParts,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";

// ── Stages: the families a chord can come from ───────────────────────────────
//
// A stage is one notion the learner works through — major-key triads, minor
// keys, sevenths, inversions. It says which key modes it opens, which chords
// open it (its seed), and which chords belong to it once it is open (its pool).
//
// Nothing here says WHICH chord comes next: that is `ladder.ts`, which ranks
// the candidates by how many real songs each would open. A stage only says
// what a chord IS.
//
// Membership is by predicate over the token's parts, and the FIRST stage of
// `STAGES` whose predicate matches owns the chord. So a chord nobody thought
// of still lands in exactly one pool, and a chord in no pool is never offered.
//
// A stage also says which of its chords are ONE IDEA — its `notion`. Chords
// sharing a notion are unlocked by one step, because a level teaches a notion:
// V⁶ and V⁶₄ are both "V, with another note in the bass", and a ladder that
// spent a level on each would be teaching the same thing twice.

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
  /** What the learner is told they are starting: "Minor keys". */
  title: string;
  /** The key modes this stage opens. Empty when it opens none. */
  modes: readonly HookpadMode[];
  /** The chords unlocked together to open the stage. Empty when it needs none. */
  seed: readonly ChordToken[];
  /**
   * Whether this chord belongs to the stage's pool.
   *
   * `unlocked` is the learner's whole set: the inversions pool reads it,
   * because an inversion is only worth learning once its root-position twin is
   * known. Pure — the same arguments always give the same answer.
   */
  holds(parts: ChordTokenParts, unlocked: ReadonlySet<ChordToken>): boolean;
  /**
   * The NOTION this chord belongs to. Candidates of this stage sharing a notion
   * are unlocked by ONE step, because they are one idea.
   *
   * Required of every stage: a stage that bundles nothing answers `ownNotion`,
   * so "this stage bundles nothing" is a stated answer rather than a missing
   * method. The string is compared, never shown — only its equality matters.
   */
  notion(parts: ChordTokenParts): string;
};

/** Every chord its own notion: this stage bundles nothing, and says so. */
export const ownNotion = (parts: ChordTokenParts): string =>
  chordTokenFromParts(parts);

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

const chord = (root: number, intervals: number[]): ChordToken =>
  chordTokenFromParts({ root, intervals, inversion: 0 });

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
 * The modal stages hold no chord at all — they open a key mode, and the chords
 * heard in it are ones the learner already knows.
 */
export const STAGES: readonly Stage[] = [
  {
    id: "major-triads",
    title: "Major keys",
    modes: ["major"],
    seed: [chord(0, [4, 3]), chord(5, [4, 3]), chord(7, [4, 3])],
    holds: (parts) =>
      rootPosition(parts) && MAJOR_TRIAD_SHAPES.has(shapeOf(parts)),
    notion: ownNotion,
  },
  {
    id: "minor-keys",
    title: "Minor keys",
    modes: ["minor"],
    // i, ♭VII, ♭VI — the three that open the most minor-key songs together.
    seed: [chord(0, [3, 4]), chord(10, [4, 3]), chord(8, [4, 3])],
    holds: (parts) =>
      rootPosition(parts) && MINOR_TRIAD_SHAPES.has(shapeOf(parts)),
    notion: ownNotion,
  },
  {
    id: "sevenths",
    title: "Sevenths",
    modes: [],
    seed: [],
    holds: (parts) =>
      rootPosition(parts) && DIATONIC_SEVENTH_SHAPES.has(shapeOf(parts)),
    notion: ownNotion,
  },
  {
    id: "inversions",
    title: "Inversions",
    modes: [],
    seed: [],
    // Only once the same chord in root position is known: naming a V⁶ before a
    // V is two notions at once. A chord whose twin is missing simply never
    // ranks — it belongs to no pool, so it is never offered.
    holds: (parts, unlocked) =>
      parts.inversion > 0 &&
      unlocked.has(chordTokenFromParts({ ...parts, inversion: 0 })),
    // The notion is the chord itself, not this one arrangement of it: every
    // inversion of a V is "V, with another note in the bass", so they arrive
    // together and one level teaches one idea.
    notion: (parts) => chordTokenFromParts({ ...parts, inversion: 0 }),
  },
  {
    id: "secondary",
    title: "Secondary dominants",
    modes: [],
    seed: [],
    holds: (parts) =>
      rootPosition(parts) &&
      (sameStack(parts.intervals, MAJOR_TRIAD) ||
        sameStack(parts.intervals, DOMINANT_SEVENTH)),
    notion: ownNotion,
  },
  {
    id: "colour",
    title: "Colour chords",
    modes: [],
    seed: [],
    holds: rootPosition,
    notion: ownNotion,
  },
  {
    id: "mixolydian",
    title: "Mixolydian",
    modes: ["mixolydian"],
    seed: [],
    holds: () => false,
    notion: ownNotion,
  },
  {
    id: "dorian",
    title: "Dorian",
    modes: ["dorian"],
    seed: [],
    holds: () => false,
    notion: ownNotion,
  },
  {
    id: "lydian",
    title: "Lydian",
    modes: ["lydian"],
    seed: [],
    holds: () => false,
    notion: ownNotion,
  },
  {
    id: "phrygian",
    title: "Phrygian",
    modes: ["phrygian"],
    seed: [],
    holds: () => false,
    notion: ownNotion,
  },
];

/** Where a stage sits in classification order: the tie-break when two steps are worth the same. */
export function stageOrder(id: StageId): number {
  const order = STAGES.findIndex((stage) => stage.id === id);
  if (order === -1) throw new Error(`No stage "${id}"`);
  return order;
}

/** The stage with this id. Throws when there is none. */
export function stageById(id: StageId): Stage {
  const stage = STAGES.find((s) => s.id === id);
  if (stage === undefined) throw new Error(`No stage "${id}"`);
  return stage;
}

/**
 * The stage this chord belongs to, or `null` when no pool holds it — an
 * inversion whose root-position twin the learner does not know. Such a chord is
 * never offered; it is not a failure, it is simply not a step yet.
 */
export function stageOf(
  token: ChordToken,
  unlocked: ReadonlySet<ChordToken>,
): StageId | null {
  const parts = parseChordToken(token);
  return STAGES.find((stage) => stage.holds(parts, unlocked))?.id ?? null;
}

/**
 * Whether the stage is already open: its whole seed unlocked and every mode it
 * opens already on. A stage with neither (sevenths, inversions, secondary,
 * colour) is open from the start — there is nothing to open.
 */
export function stageIsOpen(
  stage: Stage,
  unlocked: ReadonlySet<ChordToken>,
  modes: ReadonlySet<HookpadMode>,
): boolean {
  return (
    stage.seed.every((token) => unlocked.has(token)) &&
    stage.modes.every((mode) => modes.has(mode))
  );
}
