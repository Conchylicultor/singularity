import { describe, expect, test } from "bun:test";
import {
  ChordTokenSchema,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  STAGES,
  stageById,
  stageIsOpen,
  stageOf,
  stageOrder,
  type StageId,
} from "./stages";

const token = (text: string) => ChordTokenSchema.parse(text);
const set = (...texts: string[]) => new Set(texts.map(token));

const I = "0:4-3/0";
const IV = "5:4-3/0";
const V = "7:4-3/0";
const MAJOR = set(I, IV, V);

describe("stageOf — which family a chord belongs to", () => {
  const cases: [string, string, StageId][] = [
    // The major scale's own triads, root position.
    ["I", I, "major-triads"],
    ["ii", "2:3-4/0", "major-triads"],
    ["iii", "4:3-4/0", "major-triads"],
    ["IV", IV, "major-triads"],
    ["V", V, "major-triads"],
    ["vi", "9:3-4/0", "major-triads"],
    ["vii°", "11:3-3/0", "major-triads"],
    // The minor scale's, which the major scale does not have.
    ["i", "0:3-4/0", "minor-keys"],
    ["ii°", "2:3-3/0", "minor-keys"],
    ["♭III", "3:4-3/0", "minor-keys"],
    ["iv", "5:3-4/0", "minor-keys"],
    ["v", "7:3-4/0", "minor-keys"],
    ["♭VI", "8:4-3/0", "minor-keys"],
    ["♭VII", "10:4-3/0", "minor-keys"],
    // Sevenths the scales themselves build.
    ["V7", "7:4-3-3/0", "sevenths"],
    ["Imaj7", "0:4-3-4/0", "sevenths"],
    ["ii7", "2:3-4-3/0", "sevenths"],
    ["vi7", "9:3-4-3/0", "sevenths"],
    ["IVmaj7", "5:4-3-4/0", "sevenths"],
    ["viiø7", "11:3-3-4/0", "sevenths"],
    // A major triad or dominant seventh on a degree that does not have one.
    ["V/V", "2:4-3/0", "secondary"],
    ["V/vi", "4:4-3/0", "secondary"],
    ["V/ii", "9:4-3/0", "secondary"],
    ["I7", "0:4-3-3/0", "secondary"],
    // Everything else in root position.
    ["add9", "0:4-3-7/0", "colour"],
    ["Isus4", "0:5-2/0", "colour"],
    ["Isus2", "0:2-5/0", "colour"],
    ["I6", "0:4-3-2/0", "colour"],
    ["vii°7", "11:3-3-3/0", "colour"],
  ];
  for (const [name, text, stage] of cases) {
    test(`${name} (${text}) is a ${stage} chord`, () => {
      expect(stageOf(token(text), MAJOR)).toBe(stage);
    });
  }

  test("an inversion belongs to the inversions stage once its root position is known", () => {
    expect(stageOf(token("7:4-3/1"), MAJOR)).toBe("inversions");
    expect(stageOf(token("0:4-3/2"), MAJOR)).toBe("inversions");
    expect(stageOf(token("7:4-3-3/1"), set(I, IV, V, "7:4-3-3/0"))).toBe(
      "inversions",
    );
  });

  test("an inversion whose root position is unknown belongs to no stage, so it is never offered", () => {
    expect(stageOf(token("9:3-4/1"), MAJOR)).toBeNull(); // vi6, without vi
    expect(stageOf(token("7:4-3-3/1"), MAJOR)).toBeNull(); // V65, without V7
  });

  test("the modal stages hold no chord at all — they open a key mode", () => {
    for (const id of ["mixolydian", "dorian", "lydian", "phrygian"] as const) {
      const stage = stageById(id);
      expect(stage.seed).toEqual([]);
      expect(stage.modes).toEqual([id]);
      const held = cases
        .map(([, text]) => stageOf(token(text), MAJOR))
        .filter((stageId) => stageId === id);
      expect(held).toEqual([]);
    }
  });

  test("every root-position chord lands somewhere", () => {
    for (let root = 0; root < 12; root++) {
      for (const intervals of [
        [4, 3],
        [3, 4],
        [3, 3],
        [4, 4],
        [4, 3, 3],
        [3, 4, 3],
        [5, 2],
        [4, 3, 7],
        [7],
      ]) {
        const text = `${root}:${intervals.join("-")}/0`;
        expect(stageOf(token(text), MAJOR)).not.toBeNull();
      }
    }
  });
});

describe("the stages themselves", () => {
  test("the starting chords are the major-triads seed", () => {
    expect(stageById("major-triads").seed.map(String)).toEqual([I, IV, V]);
    expect(stageById("major-triads").modes).toEqual(["major"]);
  });

  test("the minor-keys seed is i, ♭VII and ♭VI, and it opens minor", () => {
    expect(stageById("minor-keys").seed.map(String)).toEqual([
      "0:3-4/0",
      "10:4-3/0",
      "8:4-3/0",
    ]);
    expect(stageById("minor-keys").modes).toEqual(["minor"]);
  });

  test("a stage's own seed belongs to its own pool", () => {
    for (const stage of STAGES) {
      for (const seed of stage.seed) {
        expect(stageOf(seed, new Set<ChordToken>())).toBe(stage.id);
      }
    }
  });

  test("stageById throws on an id no stage has", () => {
    expect(() => stageById("nope" as StageId)).toThrow('No stage "nope"');
    expect(() => stageOrder("nope" as StageId)).toThrow('No stage "nope"');
  });
});

describe("stageIsOpen", () => {
  test("a stage with no seed and no modes is open from the start", () => {
    for (const id of [
      "sevenths",
      "inversions",
      "secondary",
      "colour",
    ] as const) {
      expect(stageIsOpen(stageById(id), new Set<ChordToken>(), new Set())).toBe(
        true,
      );
    }
  });

  test("major triads are open at level 1; minor keys are not", () => {
    const modes = new Set(["major" as const]);
    expect(stageIsOpen(stageById("major-triads"), MAJOR, modes)).toBe(true);
    expect(stageIsOpen(stageById("minor-keys"), MAJOR, modes)).toBe(false);
    expect(stageIsOpen(stageById("mixolydian"), MAJOR, modes)).toBe(false);
  });

  test("the seed AND the modes must both be there", () => {
    const seed = stageById("minor-keys").seed;
    const withChords = new Set([...MAJOR, ...seed]);
    expect(
      stageIsOpen(
        stageById("minor-keys"),
        withChords,
        new Set(["major" as const]),
      ),
    ).toBe(false);
    expect(
      stageIsOpen(
        stageById("minor-keys"),
        withChords,
        new Set(["major" as const, "minor" as const]),
      ),
    ).toBe(true);
    // Half the seed is not the seed.
    const [first] = seed;
    if (first === undefined)
      throw new Error("the minor-keys seed is not empty");
    expect(
      stageIsOpen(
        stageById("minor-keys"),
        new Set([...MAJOR, first]),
        new Set(["major" as const, "minor" as const]),
      ),
    ).toBe(false);
  });
});
