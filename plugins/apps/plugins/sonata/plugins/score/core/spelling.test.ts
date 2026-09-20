import { describe, expect, it } from "bun:test";
import {
  accidentalGlyph,
  fifthsToTonic,
  makeKeySpeller,
  tonicFifths,
} from "./spelling";

describe("tonicFifths", () => {
  const cases: [string, number][] = [
    ["C", 0],
    ["G", 1],
    ["D", 2],
    ["F", -1],
    ["Bb", -2],
    ["B♭", -2],
    ["F#", 6],
    ["F♯", 6],
    ["Eb", -3],
    ["C##", 14],
    ["Ebb", -10],
    ["c", 0], // the letter is read case-insensitively
  ];
  for (const [tonic, fifths] of cases) {
    it(`${tonic} is ${fifths} fifths from C`, () => {
      expect(tonicFifths(tonic)).toBe(fifths);
    });
  }

  it("reads a string with no letter A–G as C", () => {
    expect(tonicFifths("")).toBe(0);
    expect(tonicFifths("H")).toBe(0);
  });
});

describe("fifthsToTonic", () => {
  const cases: [number, string][] = [
    [0, "C"],
    [1, "G"],
    [-1, "F"],
    [-2, "B♭"],
    [5, "B"],
    [6, "F♯"],
    [7, "C♯"],
    [-7, "C♭"],
    // Two sharps on: a letter's double-sharp is 7 fifths past its single, and
    // F is one flat-ward of C — so F♯♯ is 13 and C♯♯ is 14, not the other way.
    [13, "F♯♯"],
    [14, "C♯♯"],
  ];
  for (const [fifths, tonic] of cases) {
    it(`${fifths} fifths is ${tonic}`, () => {
      expect(fifthsToTonic(fifths)).toBe(tonic);
    });
  }

  it("round-trips with tonicFifths over the whole range it is used in", () => {
    for (let fifths = -20; fifths <= 20; fifths++) {
      expect(tonicFifths(fifthsToTonic(fifths))).toBe(fifths);
    }
  });

  it("spells the accidentals the way the rest of the file does", () => {
    expect(fifthsToTonic(6)).toBe("F" + accidentalGlyph(1));
    expect(fifthsToTonic(-2)).toBe("B" + accidentalGlyph(-1));
  });
});

describe("makeKeySpeller — the key's own signature", () => {
  const spell = (tonic: string, mode: "major" | "minor", pitch: number) =>
    makeKeySpeller({ tonic, mode }).spell(pitch);

  it("spells a flat key's accidentals flat", () => {
    expect(spell("Eb", "major", 68)).toEqual({
      step: "A",
      alter: -1,
      octave: 4,
    });
  });

  it("spells a sharp key's accidentals sharp", () => {
    expect(spell("E", "major", 66)).toEqual({ step: "F", alter: 1, octave: 4 });
  });

  it("gives a minor key its relative major's signature", () => {
    // A minor is C major: pitch 70 (B♭/A♯) is non-diatonic either way, and A
    // minor leans sharp, so it reads A♯.
    expect(spell("A", "minor", 70)).toEqual({
      step: "A",
      alter: 1,
      octave: 4,
    });
    // D minor is F major: one flat, so the same pitch is the diatonic B♭.
    expect(spell("D", "minor", 70)).toEqual({
      step: "B",
      alter: -1,
      octave: 4,
    });
  });
});
