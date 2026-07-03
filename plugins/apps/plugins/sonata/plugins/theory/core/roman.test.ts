import { describe, expect, it } from "bun:test";
import type { KeySignature } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { romanNumeral } from "./roman";

const C_MAJOR: KeySignature = { tonic: "C", mode: "major" };
const A_MINOR: KeySignature = { tonic: "A", mode: "minor" };

/** Build the {root, quality} shape `romanNumeral` reads. */
const chord = (root: number, quality: string) => ({ root, quality });

describe("romanNumeral — major-key diatonic triads", () => {
  // C major diatonic: I ii iii IV V vi vii°
  const cases: [number, string, string][] = [
    [0, "maj", "I"],
    [2, "min", "ii"],
    [4, "min", "iii"],
    [5, "maj", "IV"],
    [7, "maj", "V"],
    [9, "min", "vi"],
    [11, "dim", "vii°"],
  ];
  for (const [root, quality, expected] of cases) {
    it(`${expected} (root ${root}, ${quality})`, () => {
      expect(romanNumeral(chord(root, quality), C_MAJOR)).toBe(expected);
    });
  }
});

describe("romanNumeral — natural-minor diatonic triads", () => {
  // A minor diatonic: i ii° III iv v VI VII
  const cases: [number, string, string][] = [
    [9, "min", "i"],
    [11, "dim", "ii°"],
    [0, "maj", "III"],
    [2, "min", "iv"],
    [4, "min", "v"],
    [5, "maj", "VI"],
    [7, "maj", "VII"],
  ];
  for (const [root, quality, expected] of cases) {
    it(`${expected} (root ${root}, ${quality})`, () => {
      expect(romanNumeral(chord(root, quality), A_MINOR)).toBe(expected);
    });
  }
});

describe("romanNumeral — sevenths carry the figure", () => {
  it("V7 (dominant seventh)", () => {
    expect(romanNumeral(chord(7, "dom7"), C_MAJOR)).toBe("V7");
  });
  it("Imaj7", () => {
    expect(romanNumeral(chord(0, "maj7"), C_MAJOR)).toBe("Imaj7");
  });
  it("ii7 (minor seventh)", () => {
    expect(romanNumeral(chord(2, "min7"), C_MAJOR)).toBe("ii7");
  });
  it("viiø7 (half-diminished)", () => {
    expect(romanNumeral(chord(11, "halfdim7"), C_MAJOR)).toBe("viiø7");
  });
  it("vii°7 (fully diminished, minor key leading tone)", () => {
    expect(romanNumeral(chord(8, "dim7"), A_MINOR)).toBe("♯vii°7");
  });
});

describe("romanNumeral — chromatic / borrowed chords", () => {
  it("♭VII in C major (B♭ major)", () => {
    expect(romanNumeral(chord(10, "maj"), C_MAJOR)).toBe("♭VII");
  });
  it("♭III in C major (E♭ major)", () => {
    expect(romanNumeral(chord(3, "maj"), C_MAJOR)).toBe("♭III");
  });
  it("♭VI in C major (A♭ major)", () => {
    expect(romanNumeral(chord(8, "maj"), C_MAJOR)).toBe("♭VI");
  });
  it("♯IV° (raised-fourth diminished) in C major", () => {
    expect(romanNumeral(chord(6, "dim"), C_MAJOR)).toBe("♯iv°");
  });
  it("♭II (Neapolitan) in A minor", () => {
    expect(romanNumeral(chord(10, "maj"), A_MINOR)).toBe("♭II");
  });
});

describe("romanNumeral — function is key-relative", () => {
  it("same C-major chord reads I / IV / ♭VI across keys", () => {
    expect(romanNumeral(chord(0, "maj"), C_MAJOR)).toBe("I");
    expect(romanNumeral(chord(0, "maj"), { tonic: "G", mode: "major" })).toBe("IV");
    expect(romanNumeral(chord(0, "maj"), { tonic: "E", mode: "minor" })).toBe("VI");
  });
  it("respects an accidental tonic (V in F♯ major)", () => {
    // F# = pc 6; its dominant is C# = pc 1.
    expect(romanNumeral(chord(1, "maj"), { tonic: "F#", mode: "major" })).toBe("V");
  });
});

describe("romanNumeral — augmented / extended", () => {
  it("III+ (augmented triad)", () => {
    expect(romanNumeral(chord(4, "aug"), C_MAJOR)).toBe("III+");
  });
  it("V9", () => {
    expect(romanNumeral(chord(7, "dom9"), C_MAJOR)).toBe("V9");
  });
  it("IVsus4", () => {
    expect(romanNumeral(chord(5, "sus4"), C_MAJOR)).toBe("IVsus4");
  });
});
