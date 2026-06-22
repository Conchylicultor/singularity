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
