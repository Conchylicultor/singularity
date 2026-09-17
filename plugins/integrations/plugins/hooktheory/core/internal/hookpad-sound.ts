import type { HookpadChord, HookpadKey, HookpadMode } from "./schemas";

// ── A Hookpad chord → the notes it sounds ────────────────────────────────────
//
// A port of Sheet Sage's reading of Hookpad theory, NOT a new one:
// github.com/chrisdonahue/sheetsage, commit
// bbdd7b7b6a5fb845828f82790acdceb03a197779, `sheetsage/theory/theorytab.py`
// (`TheorytabChord._check_values` and `as_chord`, called with
// `root_position=True`), plus `HumanPitchName` from `theory/basic.py` for the
// tonic. Sheet Sage built its published Hooktheory dataset with it, and
// `scripts/hookpad-sound-golden.ts` checks this port against that dataset
// chord by chord. Where the reference does something odd, this does the same
// odd thing, and says so.

/**
 * Each mode's seven scale steps as semitones above the tonic. Sheet Sage keeps
 * them as the six steps between neighbours; these are their running sums.
 */
export const HOOKPAD_MODE_OFFSETS: Record<HookpadMode, readonly number[]> = {
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

/** How a chord sounds: an absolute root, and the stack of intervals above it. */
export type HookpadChordSound = {
  /** Pitch class of the root, 0–11 (C = 0). */
  rootPc: number;
  /**
   * The chord in root position as semitones between consecutive tones, lowest
   * first: `[4, 3]` is a major triad, `[3, 3, 3]` a fully diminished 7th.
   */
  intervals: number[];
  /** Hookpad's inversion, passed through: 0 = root position, 1 = 3rd in the bass, … */
  inversion: number;
};

/**
 * Which of Sheet Sage's checks a chord broke. One value per check in
 * `_check_values`, spelled as the reference spells its error, so a skip reason
 * can be grouped by it and looked up there.
 */
export type HookpadChordRule =
  | "beat"
  | "duration"
  | "root"
  | "type"
  | "inversion"
  | "applied"
  | "adds"
  | "omits"
  | "alterations"
  | "suspensions"
  | "pedal"
  | "alternate"
  | "borrowed"
  | "type,inversion"
  | "type,suspensions"
  | "type,adds"
  | "type,omits"
  | "type,alterations"
  | "inversion,omits"
  | "adds,alterations"
  | "adds,suspensions"
  | "omits,alterations"
  | "omits,suspensions";

/**
 * What one Hookpad chord is. `unreadable` is expected data, not a bug: some
 * real chords break a rule of the reference (an alteration Hookpad does not
 * offer on that chord size, a non-empty `alternate`, …), and a caller records
 * why and moves on.
 */
export type HookpadChordReading =
  | { kind: "sound"; sound: HookpadChordSound }
  | { kind: "rest" }
  | { kind: "unreadable"; rule: HookpadChordRule; detail: string };

/** The fields a chord's sound depends on. `pedal` and `alternate` are checked, never read. */
export type HookpadChordInput = Pick<
  HookpadChord,
  | "root"
  | "beat"
  | "duration"
  | "type"
  | "inversion"
  | "applied"
  | "adds"
  | "omits"
  | "alterations"
  | "suspensions"
  | "borrowed"
  | "isRest"
  | "pedal"
  | "alternate"
>;

const LETTER_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * The pitch class of a tonic spelling: a letter, then up to two accidentals of
 * one kind (`C`, `F#`, `Bb`, `E#`, `Abb`). Anything else throws: the key schema
 * has already accepted the string, so an unknown spelling is a broken
 * assumption about Hookpad's data, not a value to skip.
 */
export function hookpadTonicPc(tonic: string): number {
  const match = /^([A-G])(#{0,2}|b{0,2})$/.exec(tonic);
  const letter = match?.[1];
  const accidentals = match?.[2];
  if (letter === undefined || accidentals === undefined) {
    throw new Error(
      `Hookpad tonic ${JSON.stringify(tonic)} is not a letter A–G followed by at most two sharps or two flats`,
    );
  }
  const shift = accidentals.startsWith("#")
    ? accidentals.length
    : -accidentals.length;
  return mod12((LETTER_PC[letter] ?? 0) + shift);
}

// Sheet Sage's `_THEORYTAB_CHORD_TYPE_TO_ALLOWED_OPTIONS` — "rules written down
// manually from Hookpad": what each chord size may carry.
type AllowedOptions = {
  inversions: readonly number[];
  suspensions: readonly number[];
  adds: readonly number[];
  omits: readonly number[];
  alterations: readonly string[];
};
const ALLOWED_BY_TYPE: Record<5 | 7 | 9 | 11 | 13, AllowedOptions> = {
  5: {
    inversions: [0, 1, 2],
    suspensions: [2, 4],
    adds: [9, 4, 6],
    omits: [3, 5],
    alterations: ["b5", "#5"],
  },
  7: {
    inversions: [0, 1, 2, 3],
    suspensions: [2, 4],
    adds: [4, 6],
    omits: [3, 5],
    alterations: ["b5", "#5", "b9", "#9", "#11", "b13"],
  },
  9: {
    inversions: [0],
    suspensions: [4],
    adds: [6],
    omits: [3, 5],
    alterations: ["b5", "#5", "#11", "b13"],
  },
  11: {
    inversions: [0],
    suspensions: [2],
    adds: [],
    omits: [3, 5],
    alterations: ["b5", "#5", "b9", "#9", "b13"],
  },
  13: {
    inversions: [0],
    suspensions: [],
    adds: [],
    omits: [3, 5],
    alterations: ["b5", "#5", "b9", "#9", "#11"],
  },
};

const ALTERATIONS = ["b5", "#5", "b9", "#9", "#11", "b13"];

/** Sheet Sage's `1e-8`: the shortest duration that still sounds. */
const MIN_DURATION = 1e-8;

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function isChordType(type: number): type is keyof typeof ALLOWED_BY_TYPE {
  return type === 5 || type === 7 || type === 9 || type === 11 || type === 13;
}

function isMode(value: string): value is HookpadMode {
  return Object.hasOwn(HOOKPAD_MODE_OFFSETS, value);
}

function hasDuplicates(values: readonly (number | string)[]): boolean {
  return new Set(values).size !== values.length;
}

/** The degree an alteration acts on: `b13` → 13. */
function alterationDegree(alteration: string): number {
  return Number(alteration.slice(1));
}

/**
 * `_check_values`, in the reference's order: the first rule broken wins. `null`
 * when the chord passes them all.
 */
function brokenRule(
  chord: HookpadChordInput,
): { rule: HookpadChordRule; detail: string } | null {
  const fail = (rule: HookpadChordRule, detail: string) => ({ rule, detail });

  const minBeat = chord.isRest ? 0 : 1;
  if (chord.beat < minBeat)
    return fail("beat", `beat ${chord.beat} is before ${minBeat}`);
  if (!chord.isRest && chord.duration < MIN_DURATION)
    return fail("duration", `a sounding chord lasts ${chord.duration} beats`);

  if (chord.root <= 0) {
    if (willSound(chord))
      return fail("root", `a sounding chord has root ${chord.root}`);
  } else if (![1, 2, 3, 4, 5, 6, 7].includes(chord.root)) {
    return fail("root", `root ${chord.root} is not a degree 1–7`);
  }
  if (!isChordType(chord.type))
    return fail("type", `type ${chord.type} is not 5, 7, 9, 11 or 13`);
  if (![0, 1, 2, 3].includes(chord.inversion))
    return fail("inversion", `inversion ${chord.inversion} is not 0–3`);
  if (![0, 1, 2, 3, 4, 5, 6, 7].includes(chord.applied))
    return fail("applied", `applied ${chord.applied} is not 0–7`);
  if (
    chord.adds.some((a) => ![9, 4, 6].includes(a)) ||
    hasDuplicates(chord.adds)
  )
    return fail("adds", `adds ${JSON.stringify(chord.adds)}`);
  if (
    chord.omits.some((o) => ![3, 5].includes(o)) ||
    hasDuplicates(chord.omits)
  )
    return fail("omits", `omits ${JSON.stringify(chord.omits)}`);
  if (
    chord.alterations.some((a) => !ALTERATIONS.includes(a)) ||
    hasDuplicates(chord.alterations)
  )
    return fail(
      "alterations",
      `alterations ${JSON.stringify(chord.alterations)}`,
    );
  if (
    chord.suspensions.some((s) => ![2, 4].includes(s)) ||
    hasDuplicates(chord.suspensions)
  )
    return fail(
      "suspensions",
      `suspensions ${JSON.stringify(chord.suspensions)}`,
    );
  if (chord.pedal !== null)
    return fail("pedal", `pedal ${JSON.stringify(chord.pedal)} is set`);
  if (chord.alternate !== "")
    return fail(
      "alternate",
      `alternate ${JSON.stringify(chord.alternate)} is set`,
    );
  const { borrowed } = chord;
  if (!(
    borrowed === "" ||
    borrowed === null ||
    (Array.isArray(borrowed) && borrowed.length === 7) ||
    (typeof borrowed === "string" && isMode(borrowed))
  ))
    return fail(
      "borrowed",
      `borrowed ${JSON.stringify(borrowed)} is neither a mode nor 7 offsets`,
    );

  const allowed = ALLOWED_BY_TYPE[chord.type];
  const size = `a type-${chord.type} chord`;
  if (!allowed.inversions.includes(chord.inversion))
    return fail(
      "type,inversion",
      `${size} cannot take inversion ${chord.inversion}`,
    );
  if (chord.suspensions.some((s) => !allowed.suspensions.includes(s)))
    return fail(
      "type,suspensions",
      `${size} cannot take suspensions ${JSON.stringify(chord.suspensions)}`,
    );
  if (chord.adds.some((a) => !allowed.adds.includes(a)))
    return fail(
      "type,adds",
      `${size} cannot take adds ${JSON.stringify(chord.adds)}`,
    );
  if (chord.omits.some((o) => !allowed.omits.includes(o)))
    return fail(
      "type,omits",
      `${size} cannot take omits ${JSON.stringify(chord.omits)}`,
    );
  if (chord.alterations.some((a) => !allowed.alterations.includes(a)))
    return fail(
      "type,alterations",
      `${size} cannot take alterations ${JSON.stringify(chord.alterations)}`,
    );

  if (
    (chord.inversion === 1 && chord.omits.includes(3)) ||
    (chord.inversion === 2 && chord.omits.includes(5))
  )
    return fail(
      "inversion,omits",
      `inversion ${chord.inversion} puts an omitted tone in the bass`,
    );
  // Ported as written, though no chord reaches it: the size allow-lists above
  // already keep every add off every alteration's degree. (The reference reads
  // the degree from the alteration's LAST character only — `#11` as 1.)
  if (
    chord.alterations.some((alt) => chord.adds.includes(Number(alt.slice(-1))))
  )
    return fail(
      "adds,alterations",
      `adds ${JSON.stringify(chord.adds)} and alterations ${JSON.stringify(chord.alterations)} touch the same degree`,
    );
  if (
    (chord.suspensions.includes(2) && chord.adds.includes(9)) ||
    (chord.suspensions.includes(4) && chord.adds.includes(4))
  )
    return fail(
      "adds,suspensions",
      `suspensions ${JSON.stringify(chord.suspensions)} and adds ${JSON.stringify(chord.adds)} double a tone`,
    );
  if (
    chord.omits.includes(5) &&
    (chord.alterations.includes("b5") || chord.alterations.includes("#5"))
  )
    return fail("omits,alterations", "the 5th is both omitted and altered");
  if (chord.omits.includes(3) && chord.suspensions.length > 0)
    return fail("omits,suspensions", "the 3rd is both omitted and suspended");
  return null;
}

/** Sheet Sage's `will_sound`. */
function willSound(chord: HookpadChordInput): boolean {
  return chord.beat >= 1 && chord.duration > MIN_DURATION && !chord.isRest;
}

/**
 * The sound of one Hookpad chord in `key` (the key in force at its beat).
 *
 * Steps, as `as_chord` takes them:
 * 1. Chord degrees 1, 3, 5, … up to `type`. The first suspension replaces the
 *    3rd; adds 4 and 6 become 11 and 13; omits remove; each alteration adds its
 *    degree.
 * 2. The scale: the key's mode, or the borrowed mode, or the borrowed custom
 *    offsets exactly as given (they can go below 0 or reach 12).
 * 3. An applied chord (`applied > 0`, a V/x, vii°/x, …) moves the tonic up to
 *    the scale step of `root`, reads `applied` as the root, in major.
 * 4. Each degree becomes the scale offset of `(root − 1) + (degree − 1)`, plus
 *    an octave per 7 steps. Kept from the reference on purpose: in a chord
 *    applied to degree 7 (vii/x), the 7th is a semitone lower — the reference
 *    notes it as "not sure if this is a bug in Hookpad", and its dataset
 *    carries fully diminished vii°7/x chords because of it.
 * 5. Alterations raise (`#`) or lower (`b`) their degree a semitone.
 */
export function hookpadChordSound(
  chord: HookpadChordInput,
  key: Pick<HookpadKey, "tonic" | "scale">,
): HookpadChordReading {
  const broken = brokenRule(chord);
  if (broken !== null) return { kind: "unreadable", ...broken };
  if (!willSound(chord)) return { kind: "rest" };

  // 1. Chord degrees.
  const degrees = new Set<number>();
  for (let d = 1; d <= chord.type; d += 2) degrees.add(d);
  chord.suspensions.forEach((d, i) => {
    if (i === 0) degrees.delete(3);
    degrees.add(d);
  });
  for (const d of chord.adds) degrees.add(d === 4 || d === 6 ? d + 7 : d);
  for (const d of chord.omits) degrees.delete(d);
  for (const alt of chord.alterations) degrees.add(alterationDegree(alt));
  const sortedDegrees = [...degrees].sort((a, b) => a - b);

  // 2. The scale.
  let tonicPc = hookpadTonicPc(key.tonic);
  let scale: readonly number[];
  const { borrowed } = chord;
  if (Array.isArray(borrowed)) scale = borrowed;
  else if (typeof borrowed === "string" && isMode(borrowed))
    scale = HOOKPAD_MODE_OFFSETS[borrowed];
  else scale = HOOKPAD_MODE_OFFSETS[key.scale];

  // 3. Applied (secondary) chords.
  let root = chord.root;
  if (chord.applied > 0) {
    tonicPc = mod12(tonicPc + stepOffset(scale, root - 1));
    root = chord.applied;
    scale = HOOKPAD_MODE_OFFSETS.major;
  }

  // 4. Degrees → semitones above the tonic.
  const offsets = new Map<number, number>();
  for (const d of sortedDegrees) {
    const step = root - 1 + (d - 1);
    let offset = stepOffset(scale, step % 7) + 12 * Math.floor(step / 7);
    if (d === 7 && chord.applied === 7) offset -= 1;
    offsets.set(d, offset);
  }

  // 5. Alterations.
  for (const alt of chord.alterations) {
    const d = alterationDegree(alt);
    offsets.set(d, (offsets.get(d) ?? 0) + (alt.startsWith("b") ? -1 : 1));
  }

  const pitches = [...offsets.values()].map((o) => tonicPc + o);
  const [first = 0] = pitches;
  return {
    kind: "sound",
    sound: {
      rootPc: mod12(first),
      intervals: pitches.slice(1).map((p, i) => p - (pitches[i] ?? 0)),
      inversion: chord.inversion,
    },
  };
}

function stepOffset(scale: readonly number[], index: number): number {
  const offset = scale[index];
  if (offset === undefined) {
    throw new Error(`scale step ${index} is outside a 7-step scale`);
  }
  return offset;
}
