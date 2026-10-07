import {
  chordTokenFromParts,
  parseChordToken,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { SCALE_DEGREE_NAMES, chordLabel } from "./label";
import { chordStack, pc12 } from "./stack";

// ── What a chord does, read off its shape ────────────────────────────────────
//
// The numeral says which chord it is; a reading says what it is FOR, in the
// words a learner meets it by: "I/3" (I with its third in the bass), "V/V" (the
// dominant of V). These two are read from the token alone — no table — so
// every inversion and every applied dominant gets one. Names that depend on
// where the chord is heard (a Neapolitan in minor, a Picardy third) belong to
// whoever knows the context: the curriculum's catalog rules.

/**
 * An inverted chord as root-position chord over its bass, the bass as a scale
 * degree: I6 → "I/3", V42 → "V7/4", i6 → "i/♭3". Null in root position, and for
 * a stack whose label already names its bass ("Vsus4/1").
 */
export function inversionReading(token: ChordToken): string | null {
  const { figure } = chordLabel(token);
  if (figure === "" || figure.startsWith("/")) return null;
  const stack = chordStack(token);
  const bass = stack.tones[stack.bassIndex];
  if (bass === undefined) throw new Error("The bass index is past the stack");
  const degree = SCALE_DEGREE_NAMES[pc12(stack.root + bass)];
  if (degree === undefined) throw new Error(`No scale degree for ${bass}`);
  const twin = chordTokenFromParts({ ...parseChordToken(token), inversion: 0 });
  return `${chordLabel(twin).text}/${degree}`;
}

/** The dominant shapes an applied chord takes, what it is called, and how far below its target its root sits. */
const APPLIED: readonly {
  intervals: readonly number[];
  name: string;
  below: number;
}[] = [
  { intervals: [4, 3], name: "V", below: 7 },
  { intervals: [4, 3, 3], name: "V7", below: 7 },
  { intervals: [3, 3, 3], name: "vii°7", below: 11 },
];

/**
 * A dominant-shaped chord foreign to `scale` (semitones above the tonic of
 * its seven degrees), read by the degree it resolves to: in major, II →
 * "V/V", I7 → "V7/IV", ♯iv°7 → "vii°7/V". Null for a chord the scale builds
 * itself, an inversion, a target on the tonic (that is plain V), outside the
 * scale, or diminished (nothing resolves to a diminished chord).
 */
export function appliedReading(
  token: ChordToken,
  scale: readonly number[],
): string | null {
  const parts = parseChordToken(token);
  if (parts.inversion !== 0) return null;
  const shape = APPLIED.find(
    (a) =>
      a.intervals.length === parts.intervals.length &&
      a.intervals.every((interval, i) => interval === parts.intervals[i]),
  );
  if (shape === undefined) return null;
  const stack = chordStack(token);
  if (stack.tones.every((tone) => scale.includes(pc12(stack.root + tone)))) {
    return null;
  }
  const target = pc12(parts.root + 12 - shape.below);
  const degree = scale.indexOf(target);
  if (target === 0 || degree < 0) return null;
  const triad = diatonicTriad(scale, degree);
  if (triad[0] === 3 && triad[1] === 3) return null;
  const targetToken = chordTokenFromParts({
    root: target,
    intervals: triad,
    inversion: 0,
  });
  return `${shape.name}/${chordLabel(targetToken).text}`;
}

/** The triad the scale stacks on one of its degrees, as intervals. */
function diatonicTriad(scale: readonly number[], degree: number): number[] {
  const at = (step: number): number => {
    const pitch = scale[step % scale.length];
    if (pitch === undefined) throw new Error("A scale has seven degrees");
    return pitch + 12 * Math.floor(step / scale.length);
  };
  const root = at(degree);
  const third = at(degree + 2);
  const fifth = at(degree + 4);
  return [third - root, fifth - third];
}
