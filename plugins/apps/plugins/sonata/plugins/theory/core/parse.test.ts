import { describe, expect, it } from "bun:test";
import { parseChordSymbol } from "./parse";

describe("parseChordSymbol — non-slash", () => {
  it("parses a plain major triad", () => {
    expect(parseChordSymbol("C")).toEqual({ root: 0, quality: "maj", symbol: "C" });
  });

  it("parses minor and 7th qualities", () => {
    expect(parseChordSymbol("Am")).toMatchObject({ root: 9, quality: "min" });
    expect(parseChordSymbol("Am7")).toMatchObject({ root: 9, quality: "min7" });
    expect(parseChordSymbol("G7")).toMatchObject({ root: 7, quality: "dom7" });
    expect(parseChordSymbol("Cmaj7")).toMatchObject({ root: 0, quality: "maj7" });
  });

  it("preserves the user's root spelling on accidentals", () => {
    expect(parseChordSymbol("Bbm7")).toMatchObject({
      root: 10,
      quality: "min7",
      symbol: "Bbm7",
    });
    expect(parseChordSymbol("F#m")).toMatchObject({ root: 6, quality: "min" });
  });

  it("returns null for empty / unrecognised input", () => {
    expect(parseChordSymbol("")).toBeNull();
    expect(parseChordSymbol("N.C.")).toBeNull();
    expect(parseChordSymbol("xyz")).toBeNull();
    expect(parseChordSymbol("H")).toBeNull();
  });

  it("never sets bass on a non-slash chord", () => {
    expect(parseChordSymbol("C")!.bass).toBeUndefined();
    expect(parseChordSymbol("Am7")!.bass).toBeUndefined();
  });
});

describe("parseChordSymbol — slash bass", () => {
  it("parses a first-inversion major triad", () => {
    expect(parseChordSymbol("C/E")).toEqual({
      root: 0,
      quality: "maj",
      bass: 4,
      symbol: "C/E",
    });
  });

  it("parses G/B (bass = 11)", () => {
    expect(parseChordSymbol("G/B")).toMatchObject({ bass: 11, symbol: "G/B" });
  });

  it("parses a sharp bass D/F#", () => {
    expect(parseChordSymbol("D/F#")).toMatchObject({ bass: 6, symbol: "D/F#" });
  });

  it("parses a complex chord over a bass Am7/G", () => {
    expect(parseChordSymbol("Am7/G")).toEqual({
      root: 9,
      quality: "min7",
      bass: 7,
      symbol: "Am7/G",
    });
  });

  it("normalizes unicode accidentals in the bass", () => {
    expect(parseChordSymbol("D/F♯")).toMatchObject({ bass: 6, symbol: "D/F#" });
  });

  it("returns null when the bass is missing or unrecognised", () => {
    expect(parseChordSymbol("C/")).toBeNull();
    expect(parseChordSymbol("C/X")).toBeNull();
  });

  it("returns null when the chord part is unrecognised", () => {
    expect(parseChordSymbol("xyz/E")).toBeNull();
  });
});

describe("parseChordSymbol — suspended", () => {
  it("parses sus2 / sus4 as registered qualities (no intervals)", () => {
    expect(parseChordSymbol("Gsus4")).toEqual({
      root: 7,
      quality: "sus4",
      symbol: "Gsus4",
    });
    expect(parseChordSymbol("Csus2")).toEqual({
      root: 0,
      quality: "sus2",
      symbol: "Csus2",
    });
  });

  it("normalizes a bare `sus` to sus4", () => {
    expect(parseChordSymbol("Gsus")).toEqual({
      root: 7,
      quality: "sus4",
      symbol: "Gsus4",
    });
  });

  it("applies sus as a modifier on a 7th head", () => {
    expect(parseChordSymbol("C7sus4")).toEqual({
      root: 0,
      quality: "dom7",
      symbol: "C7sus4",
      intervals: [5, 7, 10],
    });
  });
});

describe("parseChordSymbol — 6/9", () => {
  it("parses 6/9 without mistaking the /9 for a slash bass", () => {
    expect(parseChordSymbol("Eb6/9")).toEqual({
      root: 3,
      quality: "six9",
      symbol: "Eb6/9",
    });
  });

  it("still treats /<note> as a slash bass", () => {
    expect(parseChordSymbol("C6/E")).toEqual({
      root: 0,
      quality: "maj6",
      bass: 4,
      symbol: "C6/E",
    });
  });
});

describe("parseChordSymbol — altered", () => {
  it("realises parenthetical alterations into the interval set", () => {
    expect(parseChordSymbol("G7(♯5)")).toEqual({
      root: 7,
      quality: "dom7",
      symbol: "G7(♯5)",
      intervals: [4, 8, 10],
    });
    expect(parseChordSymbol("Gsus4(♭9)")).toEqual({
      root: 7,
      quality: "sus4",
      symbol: "Gsus4(♭9)",
      intervals: [5, 7, 13],
    });
  });

  it("accepts ASCII accidentals and canonicalizes to a parenthesized suffix", () => {
    expect(parseChordSymbol("C7b9")).toEqual({
      root: 0,
      quality: "dom7",
      symbol: "C7(♭9)",
      intervals: [4, 7, 10, 13],
    });
    expect(parseChordSymbol("C7#9")).toEqual({
      root: 0,
      quality: "dom7",
      symbol: "C7(♯9)",
      intervals: [4, 7, 10, 15],
    });
    expect(parseChordSymbol("C7b5")).toEqual({
      root: 0,
      quality: "dom7",
      symbol: "C7(♭5)",
      intervals: [4, 6, 10],
    });
  });

  it("groups multiple alterations degree-sorted in one paren", () => {
    expect(parseChordSymbol("C7(b9#5)")).toEqual({
      root: 0,
      quality: "dom7",
      symbol: "C7(♯5♭9)",
      intervals: [4, 8, 10, 13],
    });
  });

  it("parses add tones and a raised 11th", () => {
    expect(parseChordSymbol("Cadd9")).toEqual({
      root: 0,
      quality: "maj",
      symbol: "Cadd9",
      intervals: [4, 7, 14],
    });
    expect(parseChordSymbol("Cmaj7#11")).toEqual({
      root: 0,
      quality: "maj7",
      symbol: "Cmaj7(♯11)",
      intervals: [4, 7, 11, 18],
    });
  });

  it("carries alterations through a slash bass", () => {
    expect(parseChordSymbol("G7(♯5)/B")).toEqual({
      root: 7,
      quality: "dom7",
      symbol: "G7(♯5)/B",
      bass: 11,
      intervals: [4, 8, 10],
    });
  });

  it("returns null for genuine typos", () => {
    expect(parseChordSymbol("Csus5")).toBeNull();
    expect(parseChordSymbol("Cbanana")).toBeNull();
    expect(parseChordSymbol("C7(x5)")).toBeNull();
  });
});
