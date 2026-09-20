import { describe, expect, it } from "bun:test";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordDigit, chordKeyPlan, type ChordDigit } from "./keys";

const token = (text: string) => ChordTokenSchema.parse(text);

describe("chordDigit", () => {
  const cases: [string, ChordDigit][] = [
    ["0:4-3/0", "1"], // I
    ["2:3-4/0", "2"], // ii
    ["4:3-4/0", "3"], // iii
    ["5:4-3/0", "4"], // IV
    ["7:4-3/0", "5"], // V
    ["9:3-4/0", "6"], // vi
    ["11:3-3/0", "7"], // vii°
  ];
  for (const [text, digit] of cases) {
    it(`${text} is on the ${digit} key`, () => {
      expect(chordDigit(token(text))).toBe(digit);
    });
  }

  it("ignores the accidental: a flattened or raised degree keeps its letter", () => {
    expect(chordDigit(token("10:4-3/0"))).toBe("7"); // ♭VII
    expect(chordDigit(token("3:4-3/0"))).toBe("3"); // ♭III
    expect(chordDigit(token("8:4-3/0"))).toBe("6"); // ♭VI
    expect(chordDigit(token("1:4-3/0"))).toBe("2"); // ♭II
    expect(chordDigit(token("6:3-3/0"))).toBe("4"); // ♯iv°
  });

  it("ignores the stack and the inversion: only the root is read", () => {
    expect(chordDigit(token("7:4-3-3/2"))).toBe("5"); // V43
    expect(chordDigit(token("7:5-2/0"))).toBe("5"); // Vsus4
  });

  it("has one for every root", () => {
    for (let root = 0; root < 12; root++) {
      expect(chordDigit(token(`${root}:4-3/0`))).toMatch(/^[1-7]$/);
    }
  });
});

describe("chordKeyPlan", () => {
  it("groups the chords by their key, digits ascending", () => {
    const plan = chordKeyPlan(["7:4-3/0", "0:4-3/0", "5:4-3/0"].map(token));
    expect(plan).toEqual([
      { digit: "1", tokens: [token("0:4-3/0")] },
      { digit: "4", tokens: [token("5:4-3/0")] },
      { digit: "5", tokens: [token("7:4-3/0")] },
    ]);
  });

  it("keeps several chords on one digit in the order given", () => {
    const plan = chordKeyPlan(
      ["7:4-3/0", "0:4-3/0", "7:4-3-3/0", "7:4-3/1"].map(token),
    );
    expect(plan).toEqual([
      { digit: "1", tokens: [token("0:4-3/0")] },
      {
        digit: "5",
        tokens: [token("7:4-3/0"), token("7:4-3-3/0"), token("7:4-3/1")],
      },
    ]);
  });

  it("puts ♭VII and vii° on the same key", () => {
    const plan = chordKeyPlan(["10:4-3/0", "11:3-3/0"].map(token));
    expect(plan).toEqual([
      { digit: "7", tokens: [token("10:4-3/0"), token("11:3-3/0")] },
    ]);
  });

  it("leaves out a digit nothing sits on, and an empty set has no groups", () => {
    expect(chordKeyPlan([token("0:4-3/0")]).map((g) => g.digit)).toEqual(["1"]);
    expect(chordKeyPlan([])).toEqual([]);
  });
});
