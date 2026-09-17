import type { HookpadChordInput, HookpadChordSound } from "./hookpad-sound";
import { HookpadModeSchema, type HookpadKey } from "./schemas";

// The one-line spelling of a golden fixture, shared by the script that writes
// them and the test that replays them — so the two cannot drift. One chord per
// line keeps the checked-in table small and its diff readable:
//
//   E minor | root=5 type=7 inv=1 applied=5 borrowed=- adds=9 omits=3 alts=b9,#11 sus=4 | 11 4,3,3 inv=1
//
// `borrowed` is `-` (not borrowed), a mode name, or a JSON array of offsets.
// An empty list is `-`. The part after the second `|` is Sheet Sage's sound:
// root pitch class, root-position intervals, inversion.

export type HookpadSoundFixture = {
  key: Pick<HookpadKey, "tonic" | "scale">;
  chord: HookpadChordInput;
  sound: HookpadChordSound;
};

const list = (values: readonly (number | string)[]) =>
  values.length === 0 ? "-" : values.join(",");

export function encodeFixture({
  key,
  chord,
  sound,
}: HookpadSoundFixture): string {
  const borrowed =
    chord.borrowed === null || chord.borrowed === ""
      ? "-"
      : typeof chord.borrowed === "string"
        ? chord.borrowed
        : JSON.stringify(chord.borrowed);
  return [
    `${key.tonic} ${key.scale}`,
    `root=${chord.root} type=${chord.type} inv=${chord.inversion} applied=${chord.applied} borrowed=${borrowed} adds=${list(chord.adds)} omits=${list(chord.omits)} alts=${list(chord.alterations)} sus=${list(chord.suspensions)}`,
    `${sound.rootPc} ${list(sound.intervals)} inv=${sound.inversion}`,
  ].join(" | ");
}

export function decodeFixture(line: string): HookpadSoundFixture {
  const fail = (why: string) =>
    new Error(`fixture ${JSON.stringify(line)}: ${why}`);
  const [keyPart, chordPart, soundPart] = line.split(" | ");
  if (
    keyPart === undefined ||
    chordPart === undefined ||
    soundPart === undefined
  )
    throw fail("expected three parts separated by ' | '");

  const [tonic, scale] = keyPart.split(" ");
  const mode = HookpadModeSchema.safeParse(scale);
  if (tonic === undefined || !mode.success) throw fail("bad key");

  const fields = new Map(
    chordPart.split(" ").map((pair) => {
      const [name = "", value = ""] = pair.split("=");
      return [name, value] as const;
    }),
  );
  const field = (name: string) => {
    const value = fields.get(name);
    if (value === undefined) throw fail(`missing ${name}`);
    return value;
  };
  const numbers = (value: string) =>
    value === "-" ? [] : value.split(",").map(Number);
  const strings = (value: string) => (value === "-" ? [] : value.split(","));
  const borrowedText = field("borrowed");
  const borrowed =
    borrowedText === "-"
      ? null
      : borrowedText.startsWith("[")
        ? parseOffsets(borrowedText, fail)
        : borrowedText;

  const [rootPc, intervals, inversion] = soundPart.split(" ");
  if (
    rootPc === undefined ||
    intervals === undefined ||
    inversion === undefined
  )
    throw fail("bad sound");

  return {
    key: { tonic, scale: mode.data },
    chord: {
      root: Number(field("root")),
      beat: 1,
      duration: 1,
      type: Number(field("type")),
      inversion: Number(field("inv")),
      applied: Number(field("applied")),
      borrowed,
      adds: numbers(field("adds")),
      omits: numbers(field("omits")),
      alterations: strings(field("alts")),
      suspensions: numbers(field("sus")),
      isRest: false,
      pedal: null,
      alternate: "",
    },
    sound: {
      rootPc: Number(rootPc),
      intervals: numbers(intervals),
      inversion: Number(inversion.replace(/^inv=/, "")),
    },
  };
}

function parseOffsets(text: string, fail: (why: string) => Error): number[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "number"))
    throw fail("borrowed is not an array of numbers");
  return parsed;
}
