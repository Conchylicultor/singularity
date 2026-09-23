import { describe, expect, it } from "bun:test";
import { HOOKPAD_SOUND_FIXTURES, LET_IT_BE_VERSE } from "../testing";
import {
  HOOKPAD_MODE_OFFSETS,
  hookpadChordSound,
  hookpadTonicPc,
  type HookpadChordInput,
  type HookpadChordReading,
  type HookpadChordRule,
} from "./hookpad-sound";
import { decodeFixture } from "./hookpad-sound.fixture-format";
import { HookpadModeSchema, type HookpadKey } from "./schemas";
import { sectionFromHookpadDoc } from "./section";

const C_MAJOR = { tonic: "C", scale: "major" } as const;

/** A root-position C-major I triad; each case overrides what it is about. */
function chord(overrides: Partial<HookpadChordInput> = {}): HookpadChordInput {
  return {
    root: 1,
    beat: 1,
    duration: 1,
    type: 5,
    inversion: 0,
    applied: 0,
    adds: [],
    omits: [],
    alterations: [],
    suspensions: [],
    borrowed: null,
    isRest: false,
    pedal: null,
    alternate: "",
    ...overrides,
  };
}

/** `[rootPc, intervals]` of a chord that must sound. */
function sound(
  overrides: Partial<HookpadChordInput>,
  key: Pick<HookpadKey, "tonic" | "scale"> = C_MAJOR,
): [number, number[]] {
  const reading = hookpadChordSound(chord(overrides), key);
  if (reading.kind !== "sound") {
    throw new Error(`expected a sound, got ${JSON.stringify(reading)}`);
  }
  return [reading.sound.rootPc, reading.sound.intervals];
}

describe("hookpadTonicPc", () => {
  it.each([
    ["C", 0],
    ["F#", 6],
    ["Bb", 10],
    ["E#", 5],
    ["Cb", 11],
    ["B##", 1],
    ["Abb", 7],
  ])("reads %p as %p", (tonic, pc) => {
    expect(hookpadTonicPc(tonic)).toBe(pc);
  });

  it.each([[""], ["H"], ["c"], ["C#b"], ["C###"], ["Fbbb"]])(
    "throws on %p",
    (tonic) => {
      expect(() => hookpadTonicPc(tonic)).toThrow(/Hookpad tonic/);
    },
  );
});

describe("HOOKPAD_MODE_OFFSETS", () => {
  it("has seven rising offsets from 0 for each of the nine modes", () => {
    for (const mode of HookpadModeSchema.options) {
      const offsets = HOOKPAD_MODE_OFFSETS[mode];
      expect(offsets).toHaveLength(7);
      expect(offsets[0]).toBe(0);
      expect(
        offsets.every((o, i) => i === 0 || o > (offsets[i - 1] ?? 0)),
      ).toBe(true);
    }
  });
});

describe("hookpadChordSound — progressions", () => {
  it("I–IV–V in C major", () => {
    expect(sound({ root: 1 })).toEqual([0, [4, 3]]);
    expect(sound({ root: 4 })).toEqual([5, [4, 3]]);
    expect(sound({ root: 5 })).toEqual([7, [4, 3]]);
  });

  it("ii°–V–i in A harmonic minor (B dim, E major, A minor)", () => {
    const key = { tonic: "A", scale: "harmonicMinor" } as const;
    expect(sound({ root: 2 }, key)).toEqual([11, [3, 3]]);
    expect(sound({ root: 5 }, key)).toEqual([4, [4, 3]]);
    expect(sound({ root: 1 }, key)).toEqual([9, [3, 4]]);
  });

  it("V/V in C is D major", () => {
    expect(sound({ root: 5, applied: 5 })).toEqual([2, [4, 3]]);
  });

  it("vii°7/V in C is F♯ fully diminished — the reference's applied-7 quirk", () => {
    // Read plainly, vii7 of G major is F♯ half-diminished ([3, 3, 4]). The
    // reference lowers the 7th of every chord applied to degree 7.
    expect(sound({ root: 5, applied: 7, type: 7 })).toEqual([6, [3, 3, 3]]);
  });

  it("borrowed minor ♭VI in C is A♭ major", () => {
    expect(sound({ root: 6, borrowed: "minor" })).toEqual([8, [4, 3]]);
  });

  it("an empty-string borrowed reads the key's own mode", () => {
    expect(sound({ root: 6, borrowed: "" })).toEqual([9, [3, 4]]);
  });

  it("a custom borrowed scale is taken as offsets from the tonic, even below 0", () => {
    expect(sound({ root: 1, borrowed: [-1, 1, 3, 5, 6, 8, 10] })).toEqual([
      11,
      [4, 3],
    ]);
  });

  it("an applied chord steps the tonic along a custom borrowed scale", () => {
    // V/ii on a scale whose 2nd step is 1: tonic C♯, V of it is G♯ major.
    expect(
      sound({ root: 2, applied: 5, borrowed: [0, 1, 3, 5, 7, 8, 10] }),
    ).toEqual([8, [4, 3]]);
  });
});

describe("hookpadChordSound — each mode's I", () => {
  it.each([
    ["major", [4, 3]],
    ["minor", [3, 4]],
    ["dorian", [3, 4]],
    ["phrygian", [3, 4]],
    ["lydian", [4, 3]],
    ["mixolydian", [4, 3]],
    ["locrian", [3, 3]],
    ["harmonicMinor", [3, 4]],
    ["phrygianDominant", [4, 3]],
  ] as const)("%s", (scale, intervals) => {
    expect(sound({}, { tonic: "D", scale })).toEqual([2, [...intervals]]);
  });
});

describe("hookpadChordSound — chord shapes (C major, on C unless noted)", () => {
  it.each<[string, Partial<HookpadChordInput>, number[]]>([
    ["sus2", { suspensions: [2] }, [2, 5]],
    ["sus4", { suspensions: [4] }, [5, 2]],
    ["sus2 + sus4", { suspensions: [2, 4] }, [2, 3, 2]],
    ["add9", { adds: [9] }, [4, 3, 7]],
    ["add4 (sounds as an 11th)", { adds: [4] }, [4, 3, 10]],
    ["add6 (sounds as a 13th)", { adds: [6] }, [4, 3, 14]],
    ["omit 3", { omits: [3] }, [7]],
    ["omit 5", { omits: [5] }, [4]],
    ["11th", { type: 11 }, [4, 3, 4, 3, 3]],
    ["13th", { type: 13 }, [4, 3, 4, 3, 3, 4]],
  ])("%s", (_, overrides, intervals) => {
    expect(sound(overrides)).toEqual([0, intervals]);
  });

  it.each([
    ["b5", [4, 2, 4]],
    ["#5", [4, 4, 2]],
    ["b9", [4, 3, 3, 3]],
    ["#9", [4, 3, 3, 5]],
    ["#11", [4, 3, 3, 8]],
    ["b13", [4, 3, 3, 10]],
  ])("G7 with %s", (alteration, intervals) => {
    expect(sound({ root: 5, type: 7, alterations: [alteration] })).toEqual([
      7,
      intervals,
    ]);
  });

  it.each([
    ["b5", [4, 2, 4, 4]],
    ["#5", [4, 4, 2, 4]],
    ["#11", [4, 3, 3, 4, 4]],
    ["b13", [4, 3, 3, 4, 6]],
  ])("G9 with %s", (alteration, intervals) => {
    expect(sound({ root: 5, type: 9, alterations: [alteration] })).toEqual([
      7,
      intervals,
    ]);
  });

  it.each([
    [5, 0],
    [5, 1],
    [5, 2],
    [7, 0],
    [7, 1],
    [7, 2],
    [7, 3],
  ])(
    "a type-%p chord in inversion %p keeps its root-position intervals",
    (type, inversion) => {
      const reading = hookpadChordSound(chord({ type, inversion }), C_MAJOR);
      expect(reading).toEqual({
        kind: "sound",
        sound: {
          rootPc: 0,
          intervals: type === 5 ? [4, 3] : [4, 3, 4],
          inversion,
        },
      });
    },
  );

  it("a rest is a rest", () => {
    expect(
      hookpadChordSound(chord({ isRest: true, root: 0 }), C_MAJOR),
    ).toEqual({
      kind: "rest",
    });
  });
});

describe("hookpadChordSound — unreadable chords, one per rule", () => {
  it.each<[HookpadChordRule, Partial<HookpadChordInput>]>([
    ["beat", { beat: 0.5 }],
    ["duration", { duration: 0 }],
    ["root", { root: 0 }],
    ["root", { root: 8 }],
    ["type", { type: 6 }],
    ["inversion", { inversion: 4 }],
    ["applied", { applied: 8 }],
    ["adds", { adds: [2] }],
    ["adds", { adds: [9, 9] }],
    ["omits", { omits: [1] }],
    ["alterations", { alterations: ["#13"] }],
    ["suspensions", { suspensions: [4, 4] }],
    ["pedal", { pedal: 5 }],
    ["alternate", { alternate: "_" }],
    ["borrowed", { borrowed: "super:2" }],
    ["borrowed", { borrowed: [0, 2, 4] }],
    ["type,inversion", { type: 9, inversion: 1 }],
    ["type,suspensions", { type: 9, suspensions: [2] }],
    ["type,adds", { type: 11, adds: [6] }],
    ["type,alterations", { alterations: ["b9"] }],
    ["inversion,omits", { inversion: 1, omits: [3] }],
    ["inversion,omits", { inversion: 2, omits: [5] }],
    ["adds,suspensions", { suspensions: [2], adds: [9] }],
    ["adds,suspensions", { suspensions: [4], adds: [4] }],
    ["omits,alterations", { omits: [5], alterations: ["#5"] }],
    ["omits,suspensions", { omits: [3], suspensions: [4] }],
    // "adds,alterations" has no case: every chord size's allow-lists already
    // keep an add and an alteration off the same degree, so no chord that
    // passes the size checks can reach it.
  ])("%s: %j", (rule, overrides) => {
    const reading = hookpadChordSound(chord(overrides), C_MAJOR);
    expect(reading.kind).toBe("unreadable");
    expect(
      (reading as Extract<HookpadChordReading, { kind: "unreadable" }>).rule,
    ).toBe(rule);
  });

  it("checks a rest too, as the reference does", () => {
    expect(
      hookpadChordSound(chord({ isRest: true, alternate: "_" }), C_MAJOR).kind,
    ).toBe("unreadable");
  });
});

describe("hookpadChordSound — real documents", () => {
  it("every chord of the captured Let It Be verse (Hookpad 2.34) reads as a sound or a rest", () => {
    const section = sectionFromHookpadDoc(
      "_NgbRXeYgQA",
      LET_IT_BE_VERSE.song,
      JSON.parse(LET_IT_BE_VERSE.jsonData),
    );
    const [key] = section.keys;
    if (key === undefined) throw new Error("the fixture has a key");
    const kinds = section.chords.map((c) => hookpadChordSound(c, key).kind);
    expect(kinds[0]).toBe("rest");
    expect(kinds.slice(1).every((k) => k === "sound")).toBe(true);
  });

  it(`agrees with Sheet Sage on all ${HOOKPAD_SOUND_FIXTURES.length} golden fixtures`, () => {
    expect(HOOKPAD_SOUND_FIXTURES.length).toBeGreaterThan(1000);
    const mismatches = HOOKPAD_SOUND_FIXTURES.flatMap((line) => {
      const fixture = decodeFixture(line);
      const reading = hookpadChordSound(fixture.chord, fixture.key);
      return reading.kind === "sound" &&
        reading.sound.rootPc === fixture.sound.rootPc &&
        reading.sound.inversion === fixture.sound.inversion &&
        reading.sound.intervals.join() === fixture.sound.intervals.join()
        ? []
        : [{ line, reading }];
    });
    expect(mismatches).toEqual([]);
  });
});
