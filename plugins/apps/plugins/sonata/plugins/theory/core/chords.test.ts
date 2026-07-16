import { describe, expect, it } from "bun:test";
import { formatChordSymbolWithBass } from "./chords";
import { parseChordSymbol } from "./parse";

/** `symbol` re-based on `bass`, driven from the parser's own ChordData. */
const rebass = (symbol: string, bass: number): string =>
  formatChordSymbolWithBass(parseChordSymbol(symbol)!, bass);

describe("formatChordSymbolWithBass", () => {
  it("appends a slash bass, naming root position unslashed", () => {
    expect(rebass("C", 4)).toBe("C/E");
    expect(rebass("C", 7)).toBe("C/G");
    expect(rebass("C", 0)).toBe("C"); // bass === root → root position.
  });

  it("keeps an alteration `quality` alone could not reproduce", () => {
    // The whole point: formatChordSymbol would rebuild these from `quality`
    // ("min7", "dom7", …) and silently drop the parenthetical.
    expect(rebass("Bm7(b9)", 0)).toBe("Bm7(♭9)/C");
    expect(rebass("Bm7(b9)", 2)).toBe("Bm7(♭9)/D");
    expect(rebass("Bm7(b9)", 11)).toBe("Bm7(♭9)");
    expect(rebass("G7(#5)", 11)).toBe("G7(♯5)/B");
    expect(rebass("Csus4(b9)", 5)).toBe("Csus4(♭9)/F");
    expect(rebass("Cadd9", 4)).toBe("Cadd9/E");
  });

  it("preserves the user's root spelling", () => {
    expect(rebass("Bbm7", 1)).toBe("Bbm7/C#");
  });

  it("replaces an existing slash bass rather than stacking another", () => {
    expect(rebass("Am7/G", 4)).toBe("Am7/E");
    expect(rebass("Am7/G", 9)).toBe("Am7"); // back to root position.
  });

  it("leaves a quality's own slash alone (6/9 is not a slash bass)", () => {
    expect(rebass("Eb6/9", 7)).toBe("Eb6/9/G");
    expect(rebass("Eb6/9", 3)).toBe("Eb6/9");
    expect(rebass("Eb6/9/G", 10)).toBe("Eb6/9/A#");
  });
});
