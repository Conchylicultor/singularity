import { describe, expect, it } from "bun:test";
import type {
  ChordData,
  KeySignature,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { formatChordLabel } from "./chord-label";

const G_MAJOR: KeySignature = { tonic: "G", mode: "major" };

/** Build the ChordData shape `formatChordLabel` reads. */
const chord = (
  symbol: string,
  root: number,
  quality: string,
): ChordData => ({ symbol, root, quality });

describe("formatChordLabel — all three modes with a key", () => {
  // Am7 in G major: root A (pc 9) is a whole step above the tonic → ii7.
  const am7 = chord("Am7", 9, "min7");
  it("symbol → the chord symbol", () => {
    expect(formatChordLabel(am7, G_MAJOR, "symbol")).toBe("Am7");
  });
  it("roman → the Roman numeral", () => {
    expect(formatChordLabel(am7, G_MAJOR, "roman")).toBe("ii7");
  });
  it("both → symbol with numeral in parentheses", () => {
    expect(formatChordLabel(am7, G_MAJOR, "both")).toBe("Am7 (ii7)");
  });
});

describe("formatChordLabel — no-key fallback", () => {
  const am7 = chord("Am7", 9, "min7");
  it("symbol mode is unaffected by a null key", () => {
    expect(formatChordLabel(am7, null, "symbol")).toBe("Am7");
  });
  it("roman falls back to the symbol without a key", () => {
    expect(formatChordLabel(am7, null, "roman")).toBe("Am7");
  });
  it("both falls back to the symbol without a key", () => {
    expect(formatChordLabel(am7, null, "both")).toBe("Am7");
  });
});

describe("formatChordLabel — unknown-quality fallback", () => {
  // A quality outside the Roman vocabulary yields a null numeral, so roman/both
  // gracefully fall back to the symbol rather than dropping the label.
  const weird = chord("Cadd?", 0, "not-a-quality");
  it("roman falls back to the symbol on an out-of-vocab quality", () => {
    expect(formatChordLabel(weird, G_MAJOR, "roman")).toBe("Cadd?");
  });
  it("both falls back to the symbol on an out-of-vocab quality", () => {
    expect(formatChordLabel(weird, G_MAJOR, "both")).toBe("Cadd?");
  });
});
