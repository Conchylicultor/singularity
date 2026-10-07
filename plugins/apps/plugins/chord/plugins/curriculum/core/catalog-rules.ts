import type { ChordTokenParts } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";

// ── The catalog's rules: tracks, and the sections a chord falls into ────────
//
// What a chord IS, read from its token's parts against the scales. The catalog
// (`catalog.ts`) counts how often each chord occurs in the song index; these
// rules only say where it goes. Plain data: a track is its key modes and an
// ordered list of section rules, and the FIRST rule of a track that holds a
// chord owns it there. A chord no rule holds goes to the track's Other section,
// so every chord of the index lands somewhere (`catalog.test.ts` checks it).

// ── Reading a chord against the scales ───────────────────────────────────────

/** Semitones above the tonic of each key mode's seven degrees. */
export const MODE_SCALES: Readonly<Record<HookpadMode, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
};

const MAJOR = MODE_SCALES.major;
const MINOR = MODE_SCALES.minor;
const HARMONIC_MINOR = MODE_SCALES.harmonicMinor;

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

const MAJOR_TRIADS = diatonicShapes(MAJOR, 3);
const MAJOR_SEVENTHS = diatonicShapes(MAJOR, 4);
const MINOR_TRIADS = diatonicShapes(MINOR, 3);
const MINOR_SEVENTHS = diatonicShapes(MINOR, 4);
const HARMONIC_MINOR_CHORDS: ReadonlySet<string> = new Set([
  ...diatonicShapes(HARMONIC_MINOR, 3),
  ...diatonicShapes(HARMONIC_MINOR, 4),
]);

const sameStack = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((interval, i) => interval === b[i]);

const MAJOR_TRIAD = [4, 3];
const DOMINANT_SEVENTH = [4, 3, 3];

const rootPosition = (parts: ChordTokenParts) => parts.inversion === 0;
const shapeOf = (parts: ChordTokenParts) =>
  shapeKey(parts.root, parts.intervals);
/** The same chord in root position. */
const twinOf = (parts: ChordTokenParts): ChordTokenParts => ({
  ...parts,
  inversion: 0,
});

/** The chord's pitch classes, relative to the tonic. */
function pitchClasses(parts: ChordTokenParts): number[] {
  const pcs = [parts.root];
  let pitch = parts.root;
  for (const interval of parts.intervals) {
    pitch += interval;
    pcs.push(pitch % 12);
  }
  return pcs;
}

/** Every tone of the chord is a note of the scale. */
const inScale = (parts: ChordTokenParts, scale: readonly number[]) =>
  pitchClasses(parts).every((pc) => scale.includes(pc));

/** How many tones the chord has: its root and one per interval. */
const toneCount = (parts: ChordTokenParts) => parts.intervals.length + 1;

/** Built only from thirds, seconds and fourths (no add9-style leap): a stack a seventh or an extension grows from. */
const stackedOnly = (parts: ChordTokenParts) =>
  parts.intervals.every((interval) => interval <= 5);

/** A diminished triad, diminished seventh or half-diminished seventh, on any root. */
const diminished = (parts: ChordTokenParts) =>
  sameStack(parts.intervals, [3, 3]) ||
  sameStack(parts.intervals, [3, 3, 3]) ||
  sameStack(parts.intervals, [3, 3, 4]);

const dominant = (parts: ChordTokenParts) =>
  sameStack(parts.intervals, MAJOR_TRIAD) ||
  sameStack(parts.intervals, DOMINANT_SEVENTH);

// ── Tracks and section rules ─────────────────────────────────────────────────

/**
 * One section of a track: which chords it holds. `holds` is pure over the
 * token's parts; an inversion rule asks another rule about the root-position
 * twin (`inversionOf`), so "an inversion of a diatonic chord" is stated once,
 * not as a second list.
 */
export type SectionRule = {
  /** Unique within its track: the section's id is `<track>:<id>`. */
  id: string;
  name: string;
  /** The key modes whose windows the section counts in. Absent = the track's. */
  scope?: readonly HookpadMode[];
  holds: (parts: ChordTokenParts) => boolean;
};

export type TrackRule = {
  id: string;
  name: string;
  /** One sentence on what the track is about. */
  blurb: string;
  /** The key modes whose windows the track counts in. */
  scope: readonly HookpadMode[];
  /** Which chords the track places at all (Sevenths & jazz: four tones or more). Absent = every chord. */
  admits?: (parts: ChordTokenParts) => boolean;
  /** The share from which a chord is listed rather than folded as rare. Absent = `LISTED_SHARE` (1 %). */
  listedShare?: number;
  /** In classification order: the first that holds a chord owns it. Other is added after them. */
  sections: readonly SectionRule[];
};

/** The id every track's catch-all section takes. */
export const OTHER_SECTION_ID = "other";
/** The id of a track's always-listed first section. */
export const CORE_SECTION_ID = "core";

/** An inversion whose root-position twin one of `rules` holds. */
const inversionOf =
  (...rules: ((parts: ChordTokenParts) => boolean)[]) =>
  (parts: ChordTokenParts) =>
    parts.inversion > 0 && rules.some((holds) => holds(twinOf(parts)));

const majorTriad = (parts: ChordTokenParts) =>
  rootPosition(parts) && MAJOR_TRIADS.has(shapeOf(parts));
const majorSeventh = (parts: ChordTokenParts) =>
  rootPosition(parts) && MAJOR_SEVENTHS.has(shapeOf(parts));
const minorTriad = (parts: ChordTokenParts) =>
  rootPosition(parts) && MINOR_TRIADS.has(shapeOf(parts));
const minorSeventh = (parts: ChordTokenParts) =>
  rootPosition(parts) && MINOR_SEVENTHS.has(shapeOf(parts));
const harmonicMinor = (parts: ChordTokenParts) =>
  rootPosition(parts) && HARMONIC_MINOR_CHORDS.has(shapeOf(parts));
/** A major triad or dominant seventh on a degree of the major scale (one that does not build it, once the diatonic rules ran). */
const secondaryDominant = (parts: ChordTokenParts) =>
  rootPosition(parts) && dominant(parts) && MAJOR.includes(parts.root);
/** Dorian's sixth degree, a semitone above the natural minor's: what makes a chord dorian rather than minor. */
const RAISED_SIXTH = 9;
/** The flat degrees a major key borrows its roots from: ♭II, ♭III, ♭VI, ♭VII. */
const FLAT_DEGREES = [1, 3, 8, 10];
/** A chord borrowed into a major key: the minor scale's own triads and sevenths, or any chord on a flat degree (♭VIImaj7, ♭VIadd9, the Neapolitan ♭II). */
const borrowedIntoMajor = (parts: ChordTokenParts) =>
  minorTriad(parts) ||
  minorSeventh(parts) ||
  (rootPosition(parts) && FLAT_DEGREES.includes(parts.root));
/** Every other root-position chord whose tones all sit in the scale: sus, add, sixths, extensions. */
const colourOf = (scale: readonly number[]) => (parts: ChordTokenParts) =>
  rootPosition(parts) && inScale(parts, scale);
const passing = (parts: ChordTokenParts) =>
  rootPosition(parts) && diminished(parts);

// Each track's root-position families, so its Inversions rule can name them.
const MAJOR_FAMILIES = [
  majorTriad,
  majorSeventh,
  secondaryDominant,
  borrowedIntoMajor,
  colourOf(MAJOR),
  passing,
];
/** A chord borrowed into a minor key: the major scale's triads and sevenths, and any chord on dorian's raised sixth (IV7, viø7, vi°). */
const borrowedIntoMinor = (parts: ChordTokenParts) =>
  majorTriad(parts) ||
  majorSeventh(parts) ||
  (rootPosition(parts) &&
    inScale(parts, MODE_SCALES.dorian) &&
    pitchClasses(parts).includes(RAISED_SIXTH));
/** In a minor key, any major triad or dominant seventh the rules before did not claim: II, I7, VI7… */
const minorSecondary = (parts: ChordTokenParts) =>
  rootPosition(parts) && dominant(parts);
const neapolitanOrColour = (parts: ChordTokenParts) =>
  rootPosition(parts) &&
  (inScale(parts, MINOR) ||
    // The Neapolitan ♭II, and its major seventh.
    (parts.root === 1 &&
      (sameStack(parts.intervals, MAJOR_TRIAD) ||
        sameStack(parts.intervals, [4, 3, 4]))));
const MINOR_FAMILIES = [
  minorTriad,
  minorSeventh,
  harmonicMinor,
  borrowedIntoMinor,
  minorSecondary,
  neapolitanOrColour,
  passing,
];
const extension = (parts: ChordTokenParts) =>
  rootPosition(parts) && stackedOnly(parts) && inScale(parts, MAJOR);
const borrowedSeventh = (parts: ChordTokenParts) =>
  minorSeventh(parts) ||
  (rootPosition(parts) && FLAT_DEGREES.includes(parts.root));
const substitution = (parts: ChordTokenParts) =>
  rootPosition(parts) && (dominant(parts) || diminished(parts));
const JAZZ_FAMILIES = [
  majorSeventh,
  secondaryDominant,
  extension,
  borrowedSeventh,
  substitution,
];

const MODAL_MODES = [
  ["mixolydian", "Mixolydian"],
  ["dorian", "Dorian"],
  ["lydian", "Lydian"],
  ["phrygian", "Phrygian"],
  ["locrian", "Locrian"],
  ["harmonicMinor", "Harmonic minor"],
  ["phrygianDominant", "Phrygian dominant"],
] as const satisfies readonly (readonly [HookpadMode, string])[];

/**
 * Every track, in the order the catalog shows them. Section order here is
 * CLASSIFICATION order (which rule wins a borderline chord); the catalog shows
 * sections by coverage instead, Core first and Other last. An Inversions
 * section holds the inversions of every family its track names, so V/V⁶ is
 * an inversion like V⁶.
 *
 * - Major: the scale's triads (Core), its sevenths, inversions, secondary
 *   dominants (a major triad or dominant seventh on a degree that does not
 *   build one), chords borrowed from the parallel minor or built on a flat
 *   degree, colour (every other chord whose tones all sit in the scale: sus,
 *   add, sixths, extensions), diminished and passing chords.
 * - Minor: the natural minor's triads (Core) and sevenths, harmonic minor's
 *   (V, V7, vii°), inversions, chords borrowed from the parallel major or
 *   dorian, colour and the Neapolitan ♭II, secondary dominants (any other
 *   major triad or dominant seventh), diminished.
 * - Modal: one section per mode, each counted in its own mode's windows and
 *   holding every chord heard there — a mode is learned as a home, not as a
 *   family of chords. Its windows are few (6,312 in mixolydian, 233 in
 *   phrygian dominant), so it lists a chord from `listedShare` 5 %, not 1 %:
 *   at 1 % a mode would list fifty chords.
 * - Sevenths & jazz (major windows, four tones or more): diatonic sevenths,
 *   secondary dominants, inversions, extensions and sus, borrowed sevenths,
 *   substitutions and diminished sevenths.
 */
export const TRACK_RULES: readonly TrackRule[] = [
  {
    id: "major",
    name: "Major",
    blurb: "The chords of major-key songs, most common first.",
    scope: ["major"],
    sections: [
      { id: CORE_SECTION_ID, name: "Core", holds: majorTriad },
      { id: "sevenths", name: "Diatonic sevenths", holds: majorSeventh },
      {
        id: "inversions",
        name: "Inversions",
        holds: inversionOf(...MAJOR_FAMILIES),
      },
      {
        id: "secondary",
        name: "Secondary dominants",
        holds: secondaryDominant,
      },
      { id: "borrowed", name: "Borrowed from minor", holds: borrowedIntoMajor },
      { id: "colour", name: "Colour", holds: colourOf(MAJOR) },
      { id: "diminished", name: "Diminished & passing", holds: passing },
    ],
  },
  {
    id: "minor",
    name: "Minor",
    blurb: "Minor-key songs: a new home chord, i.",
    scope: ["minor"],
    sections: [
      { id: CORE_SECTION_ID, name: "Core", holds: minorTriad },
      { id: "sevenths", name: "Sevenths", holds: minorSeventh },
      { id: "harmonic", name: "Harmonic minor", holds: harmonicMinor },
      {
        id: "inversions",
        name: "Inversions",
        holds: inversionOf(...MINOR_FAMILIES),
      },
      { id: "borrowed", name: "Borrowed from major", holds: borrowedIntoMinor },
      {
        id: "colour",
        name: "Colour & chromatic",
        holds: neapolitanOrColour,
      },
      { id: "secondary", name: "Secondary dominants", holds: minorSecondary },
      { id: "diminished", name: "Diminished & passing", holds: passing },
    ],
  },
  {
    id: "modal",
    name: "Modal",
    blurb: "Chords you know, heard from a different home.",
    scope: MODAL_MODES.map(([mode]) => mode),
    listedShare: 0.05,
    sections: MODAL_MODES.map(([mode, name]) => ({
      id: mode,
      name,
      scope: [mode],
      holds: () => true,
    })),
  },
  {
    id: "jazz",
    name: "Sevenths & jazz",
    blurb: "Seventh chords and beyond, in major-key songs.",
    scope: ["major"],
    admits: (parts) => toneCount(parts) >= 4,
    sections: [
      { id: "sevenths", name: "Diatonic sevenths", holds: majorSeventh },
      {
        id: "secondary",
        name: "Secondary dominants",
        holds: secondaryDominant,
      },
      {
        id: "inversions",
        name: "Inversions",
        holds: inversionOf(...JAZZ_FAMILIES),
      },
      { id: "extensions", name: "Extensions & sus", holds: extension },
      { id: "borrowed", name: "Borrowed sevenths", holds: borrowedSeventh },
      {
        id: "substitutions",
        name: "Substitutions & diminished",
        holds: substitution,
      },
    ],
  },
];
