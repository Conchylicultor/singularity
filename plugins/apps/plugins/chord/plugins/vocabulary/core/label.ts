import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  CHORD_TEMPLATES,
  romanNumeral,
  type ChordTemplate,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { chordStack, pc12, type ChordStack } from "./stack";

// ── A chord token as a Roman numeral ─────────────────────────────────────────
//
// A token is a sound relative to the tonic, so it is named as Sonata names a
// chord in C major: the root's degree picks the numeral (with ♭ / ♯ for a
// chromatic root, Sonata's conventional readings), the quality its case and
// mark, and the inversion a figure. Every valid token gets a label: a stack
// Sonata has no quality for is spelled out interval by interval.

export type ChordLabel = {
  /** The degree, cased by quality: "IV", "ii", "♭VII", "vii". */
  numeral: string;
  /** The quality mark after the numeral: "", "7", "°", "ø7", "maj7", "+", "sus4", or a spelled stack "(3,5,9)". */
  suffix: string;
  /**
   * The inversion figure: "" in root position; "6" / "64" for a triad;
   * "65" / "43" / "42" for a seventh chord (whose suffix then drops its "7",
   * as in V⁶₅). Any other chord names its bass by scale degree: "/5".
   */
  figure: string;
  /** The whole label on one line: "V7", "IV6", "vii°", "V65". */
  text: string;
};

/** The one key every token is read in: tokens are already relative to the tonic. */
const C_MAJOR = { tonic: "C", mode: "major" } as const;

const TRIADS = new Set(["maj", "min", "aug", "dim"]);
const SEVENTHS = new Set([
  "maj7",
  "dom7",
  "min7",
  "minmaj7",
  "halfdim7",
  "dim7",
  "augmaj7",
  "aug7",
]);

const TRIAD_FIGURES = ["", "6", "64"] as const;
const SEVENTH_FIGURES = ["", "65", "43", "42"] as const;

/** A pitch above the tonic as a major-scale degree, with Sonata's accidental readings. */
const SCALE_DEGREE_NAMES = [
  "1",
  "♭2",
  "2",
  "♭3",
  "3",
  "4",
  "♯4",
  "5",
  "♭6",
  "6",
  "♭7",
  "7",
] as const;

/** A tone above the root, as a chord member, within the octave and in the next one. */
const SIMPLE_INTERVAL_NAMES = [
  "1",
  "♭2",
  "2",
  "♭3",
  "3",
  "4",
  "♭5",
  "5",
  "♯5",
  "6",
  "♭7",
  "7",
] as const;
const COMPOUND_INTERVAL_NAMES = [
  "8",
  "♭9",
  "9",
  "♯9",
  "10",
  "11",
  "♯11",
  "12",
  "♭13",
  "13",
  "♭14",
  "14",
] as const;

type Kind = "triad" | "seventh" | "other";

export function chordLabel(token: ChordToken): ChordLabel {
  const stack = chordStack(token);
  const template = matchTemplate(stack.tones);
  const named =
    template === undefined ? spelled(stack) : fromSonata(stack, template);

  const inverted = stack.bassIndex > 0;
  const suffix =
    named.kind === "seventh" && inverted
      ? named.suffix.replace(/7$/, "")
      : named.suffix;
  const figure = inversionFigure(stack, named.kind);
  return {
    numeral: named.numeral,
    suffix,
    figure,
    text: named.numeral + suffix + figure,
  };
}

function matchTemplate(tones: readonly number[]): ChordTemplate | undefined {
  const above = tones.slice(1);
  return CHORD_TEMPLATES.find(
    (t) =>
      t.intervals.length === above.length &&
      t.intervals.every((interval, i) => interval === above[i]),
  );
}

type Named = { numeral: string; suffix: string; kind: Kind };

/** A stack Sonata has a quality for: its numeral, split into the degree and the mark after it. */
function fromSonata(stack: ChordStack, template: ChordTemplate): Named {
  const full = romanNumeral(
    { root: stack.root, quality: template.quality },
    C_MAJOR,
  );
  // Every CHORD_TEMPLATES quality has a Roman style; a new one without must
  // still get a label, so it is spelled out.
  if (full === null) return spelled(stack);
  const numeral = [
    degreeNumeral(stack.root, false),
    degreeNumeral(stack.root, true),
  ].find((n) => full.startsWith(n));
  if (numeral === undefined) {
    throw new Error(
      `Sonata's numeral "${full}" for ${template.quality} on ${stack.root} does not start with its degree`,
    );
  }
  const kind: Kind = TRIADS.has(template.quality)
    ? "triad"
    : SEVENTHS.has(template.quality)
      ? "seventh"
      : "other";
  return { numeral, suffix: full.slice(numeral.length), kind };
}

/**
 * A stack outside Sonata's table (an add9, a power chord, a borrowed oddity):
 * the degree, lowercase when the stack has a minor third and no major one, and
 * every tone above the root spelled as a chord member.
 */
function spelled(stack: ChordStack): Named {
  const pcs = stack.tones.map(pc12);
  const lower = pcs.includes(3) && !pcs.includes(4);
  const above = stack.tones.slice(1).map(intervalName);
  return {
    numeral: degreeNumeral(stack.root, lower),
    // A lone root spells as "(1)": nothing sounds above it.
    suffix: `(${above.length === 0 ? "1" : above.join(",")})`,
    kind: "other",
  };
}

/** The bare numeral of a degree, through Sonata's plain major / minor triad reading. */
function degreeNumeral(root: number, lower: boolean): string {
  const numeral = romanNumeral(
    { root, quality: lower ? "min" : "maj" },
    C_MAJOR,
  );
  if (numeral === null) {
    throw new Error("Sonata has no Roman numeral for a major or minor triad");
  }
  return numeral;
}

/** A tone above the root. Beyond two octaves it is named by its place in the second: what the ear hears. */
function intervalName(semitones: number): string {
  const names =
    semitones < 12 ? SIMPLE_INTERVAL_NAMES : COMPOUND_INTERVAL_NAMES;
  const name = names[semitones % 12];
  if (name === undefined) throw new Error(`No name for ${semitones} semitones`);
  return name;
}

function inversionFigure(stack: ChordStack, kind: Kind): string {
  if (stack.bassIndex === 0) return "";
  const figures =
    kind === "triad"
      ? TRIAD_FIGURES
      : kind === "seventh"
        ? SEVENTH_FIGURES
        : undefined;
  const figure = figures?.[stack.bassIndex];
  if (figure !== undefined) return figure;
  const bass = stack.tones[stack.bassIndex];
  if (bass === undefined) throw new Error("The bass index is past the stack");
  const degree = SCALE_DEGREE_NAMES[pc12(stack.root + bass)];
  if (degree === undefined) throw new Error(`No scale degree for ${bass}`);
  return `/${degree}`;
}
