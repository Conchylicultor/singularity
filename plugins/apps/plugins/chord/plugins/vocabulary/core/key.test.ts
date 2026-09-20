import { describe, expect, it } from "bun:test";
import { HookpadModeSchema } from "@plugins/integrations/plugins/hooktheory/core";
import { songKeyLabel, songKeySignature, type SongKey } from "./key";

describe("songKeySignature", () => {
  const cases: [SongKey, string][] = [
    [{ tonic: "C", mode: "major" }, "C"],
    [{ tonic: "A", mode: "minor" }, "C"],
    [{ tonic: "D", mode: "dorian" }, "C"],
    [{ tonic: "Eb", mode: "mixolydian" }, "A♭"],
    [{ tonic: "F#", mode: "dorian" }, "E"],
    [{ tonic: "F", mode: "lydian" }, "C"],
    [{ tonic: "B", mode: "locrian" }, "C"],
    [{ tonic: "A", mode: "harmonicMinor" }, "C"],
    [{ tonic: "C", mode: "phrygianDominant" }, "A♭"],
    [{ tonic: "C#", mode: "major" }, "C♯"],
    [{ tonic: "Gb", mode: "lydian" }, "D♭"],
  ];
  for (const [key, tonic] of cases) {
    it(`${key.tonic} ${key.mode} is written in ${tonic} major`, () => {
      expect(songKeySignature(key)).toEqual({ tonic, mode: "major" });
    });
  }

  it("gives an altered mode its parent's signature: the raised step is an accidental", () => {
    expect(songKeySignature({ tonic: "A", mode: "harmonicMinor" })).toEqual(
      songKeySignature({ tonic: "A", mode: "minor" }),
    );
    expect(songKeySignature({ tonic: "E", mode: "phrygianDominant" })).toEqual(
      songKeySignature({ tonic: "E", mode: "phrygian" }),
    );
  });

  it("has a signature for every Hookpad mode", () => {
    for (const mode of HookpadModeSchema.options) {
      expect(songKeySignature({ tonic: "C", mode }).mode).toBe("major");
    }
  });

  it("throws on a tonic it cannot read, rather than answering C major", () => {
    expect(() => songKeySignature({ tonic: "H", mode: "major" })).toThrow(
      /Hookpad tonic/,
    );
  });
});

describe("songKeyLabel", () => {
  it("reads the tonic with glyph accidentals and the mode as words", () => {
    expect(songKeyLabel({ tonic: "G", mode: "major" })).toBe("G major");
    expect(songKeyLabel({ tonic: "Eb", mode: "mixolydian" })).toBe(
      "E♭ mixolydian",
    );
    expect(songKeyLabel({ tonic: "F#", mode: "dorian" })).toBe("F♯ dorian");
    expect(songKeyLabel({ tonic: "A", mode: "harmonicMinor" })).toBe(
      "A harmonic minor",
    );
    expect(songKeyLabel({ tonic: "C", mode: "phrygianDominant" })).toBe(
      "C phrygian dominant",
    );
  });

  it("keeps the song's own spelling: G♭ is not renamed F♯", () => {
    expect(songKeyLabel({ tonic: "Gb", mode: "lydian" })).toBe("G♭ lydian");
  });

  it("has words for every Hookpad mode", () => {
    for (const mode of HookpadModeSchema.options) {
      expect(songKeyLabel({ tonic: "C", mode })).toMatch(/^C [a-z ]+$/);
    }
  });
});
