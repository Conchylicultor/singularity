import { describe, expect, it } from "bun:test";
import { parseKeySignature } from "./key";

describe("parseKeySignature", () => {
  it("parses plain major letters", () => {
    expect(parseKeySignature("C")).toEqual({ tonic: "C", mode: "major" });
    expect(parseKeySignature("G")).toEqual({ tonic: "G", mode: "major" });
  });

  it("parses minor shorthand", () => {
    expect(parseKeySignature("Am")).toEqual({ tonic: "A", mode: "minor" });
    expect(parseKeySignature("Em")).toEqual({ tonic: "E", mode: "minor" });
  });

  it("preserves accidentals in the tonic", () => {
    expect(parseKeySignature("F#")).toEqual({ tonic: "F#", mode: "major" });
    expect(parseKeySignature("F#m")).toEqual({ tonic: "F#", mode: "minor" });
    expect(parseKeySignature("Bb")).toEqual({ tonic: "Bb", mode: "major" });
    expect(parseKeySignature("Bbm")).toEqual({ tonic: "Bb", mode: "minor" });
  });

  it("normalizes unicode accidental glyphs", () => {
    expect(parseKeySignature("F♯")).toEqual({ tonic: "F#", mode: "major" });
    expect(parseKeySignature("B♭m")).toEqual({ tonic: "Bb", mode: "minor" });
  });

  it("handles the maj/min word forms", () => {
    expect(parseKeySignature("Cmaj")).toEqual({ tonic: "C", mode: "major" });
    expect(parseKeySignature("Cmajor")).toEqual({ tonic: "C", mode: "major" });
    expect(parseKeySignature("CM")).toEqual({ tonic: "C", mode: "major" });
    expect(parseKeySignature("Amin")).toEqual({ tonic: "A", mode: "minor" });
    expect(parseKeySignature("Aminor")).toEqual({ tonic: "A", mode: "minor" });
  });

  it("trims surrounding whitespace and word-form spacing", () => {
    expect(parseKeySignature("  G  ")).toEqual({ tonic: "G", mode: "major" });
    expect(parseKeySignature("G minor")).toEqual({ tonic: "G", mode: "minor" });
  });

  it("uppercases a lowercase letter while preserving the accidental", () => {
    expect(parseKeySignature("f#")).toEqual({ tonic: "F#", mode: "major" });
    expect(parseKeySignature("bbm")).toEqual({ tonic: "Bb", mode: "minor" });
  });

  it("returns null on empty / garbage", () => {
    expect(parseKeySignature("")).toBeNull();
    expect(parseKeySignature("   ")).toBeNull();
    expect(parseKeySignature(null)).toBeNull();
    expect(parseKeySignature(undefined)).toBeNull();
    expect(parseKeySignature("xyz")).toBeNull();
    expect(parseKeySignature("H")).toBeNull();
    expect(parseKeySignature("Cfoo")).toBeNull();
  });
});
