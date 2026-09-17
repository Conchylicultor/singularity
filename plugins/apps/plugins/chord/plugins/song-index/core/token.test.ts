import { describe, expect, it } from "bun:test";
import {
  ChordTokenSchema,
  chordToken,
  chordTokenFromParts,
  parseChordToken,
} from "./token";

describe("chord token", () => {
  it("spells a sound relative to the tonic", () => {
    // G7 in C, first inversion → V7/1.
    expect<string>(
      chordToken({ rootPc: 7, intervals: [4, 3, 3], inversion: 1 }, 0),
    ).toBe("7:4-3-3/1");
    // C major in D: the root sits 10 semitones above the tonic (♭VII), wrapping below 0.
    expect<string>(
      chordToken({ rootPc: 0, intervals: [4, 3], inversion: 0 }, 2),
    ).toBe("10:4-3/0");
    expect<string>(
      chordToken({ rootPc: 5, intervals: [4, 3], inversion: 0 }, 5),
    ).toBe("0:4-3/0");
  });

  it.each([
    "0:4-3/0",
    "7:4-3-3/1",
    "10:4-3/0",
    "11:3-3-3/3",
    "2:7/0",
    "4:/0",
    "9:4-3-3-4-3-4/2",
  ])("round-trips %p", (token) => {
    const parts = parseChordToken(token);
    expect(chordTokenFromParts(parts)).toBe(token as never);
    expect(ChordTokenSchema.safeParse(token).success).toBe(true);
  });

  it("reads a token's parts", () => {
    expect(parseChordToken("7:4-3-3/1")).toEqual({
      root: 7,
      intervals: [4, 3, 3],
      inversion: 1,
    });
    expect(parseChordToken("4:/0")).toEqual({
      root: 4,
      intervals: [],
      inversion: 0,
    });
  });

  it.each([
    "",
    "12:4-3/0",
    "-1:4-3/0",
    "07:4-3/0",
    "7:4-0/0",
    "7:4--3/0",
    "7:4-3",
    "7:4-3/01",
    "I",
    "7:4-3/0 ",
  ])("refuses %p", (text) => {
    expect(() => parseChordToken(text)).toThrow("is not a chord token");
    expect(ChordTokenSchema.safeParse(text).success).toBe(false);
  });

  it("refuses parts no token can spell", () => {
    expect(() =>
      chordTokenFromParts({ root: 12, intervals: [4, 3], inversion: 0 }),
    ).toThrow();
    expect(() =>
      chordTokenFromParts({ root: 0, intervals: [0], inversion: 0 }),
    ).toThrow();
    expect(() =>
      chordTokenFromParts({ root: 0, intervals: [4], inversion: -1 }),
    ).toThrow();
  });
});
