import { describe, expect, it } from "bun:test";
import {
  ChordTokenSchema,
  chordTokenFromParts,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { CHORD_TEMPLATES } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { chordLabel } from "./label";

const label = (token: string) => chordLabel(ChordTokenSchema.parse(token));

describe("chordLabel — triads", () => {
  const cases: [string, string, string, string][] = [
    // token, numeral, suffix, text
    ["0:4-3/0", "I", "", "I"],
    ["2:3-4/0", "ii", "", "ii"],
    ["4:3-4/0", "iii", "", "iii"],
    ["5:4-3/0", "IV", "", "IV"],
    ["7:4-3/0", "V", "", "V"],
    ["9:3-4/0", "vi", "", "vi"],
    ["11:3-3/0", "vii", "°", "vii°"],
    ["0:4-4/0", "I", "+", "I+"],
  ];
  for (const [token, numeral, suffix, text] of cases) {
    it(`${token} is ${text}`, () => {
      expect(label(token)).toEqual({ numeral, suffix, figure: "", text });
    });
  }
});

describe("chordLabel — sevenths", () => {
  const cases: [string, string, string, string][] = [
    ["7:4-3-3/0", "V", "7", "V7"],
    ["0:4-3-4/0", "I", "maj7", "Imaj7"],
    ["2:3-4-3/0", "ii", "7", "ii7"],
    ["11:3-3-4/0", "vii", "ø7", "viiø7"],
    ["11:3-3-3/0", "vii", "°7", "vii°7"],
  ];
  for (const [token, numeral, suffix, text] of cases) {
    it(`${token} is ${text}`, () => {
      expect(label(token)).toEqual({ numeral, suffix, figure: "", text });
    });
  }
});

describe("chordLabel — inversions", () => {
  it("figures a triad's inversions 6 and 64", () => {
    expect(label("5:4-3/1")).toEqual({
      numeral: "IV",
      suffix: "",
      figure: "6",
      text: "IV6",
    });
    expect(label("0:4-3/2").text).toBe("I64");
    expect(label("11:3-3/1").text).toBe("vii°6");
  });

  it("figures a seventh's inversions 65, 43, 42, the figure replacing the 7", () => {
    expect(label("7:4-3-3/1")).toEqual({
      numeral: "V",
      suffix: "",
      figure: "65",
      text: "V65",
    });
    expect(label("7:4-3-3/2").text).toBe("V43");
    expect(label("7:4-3-3/3").text).toBe("V42");
    expect(label("11:3-3-4/1")).toEqual({
      numeral: "vii",
      suffix: "ø",
      figure: "65",
      text: "viiø65",
    });
    expect(label("11:3-3-3/2").text).toBe("vii°43");
    expect(label("0:4-3-4/3").text).toBe("Imaj42");
  });

  it("names the bass by scale degree for any other chord", () => {
    // Vsus4 with its 4th (C) in the bass.
    expect(label("7:5-2/1")).toEqual({
      numeral: "V",
      suffix: "sus4",
      figure: "/1",
      text: "Vsus4/1",
    });
  });

  it("puts the top tone in the bass when the inversion runs past the stack", () => {
    // V7 with no 5th, third inversion: the 7th (F) in the bass.
    expect(label("7:4-6/3")).toEqual({
      numeral: "V",
      suffix: "(3,♭7)",
      figure: "/4",
      text: "V(3,♭7)/4",
    });
  });
});

describe("chordLabel — chromatic roots", () => {
  const cases: [string, string][] = [
    ["10:4-3/0", "♭VII"],
    ["3:4-3/0", "♭III"],
    ["8:4-3/0", "♭VI"],
    ["1:4-3/0", "♭II"],
    ["8:4-4/0", "♭VI+"],
    ["10:3-4/0", "♭vii"],
    ["6:3-3/0", "♯iv°"],
  ];
  for (const [token, text] of cases) {
    it(`${token} is ${text}`, () => {
      expect(label(token).text).toBe(text);
    });
  }

  it("keeps the accidental in the numeral, not the suffix", () => {
    expect(label("10:4-3-3/0")).toEqual({
      numeral: "♭VII",
      suffix: "7",
      figure: "",
      text: "♭VII7",
    });
  });
});

describe("chordLabel — stacks outside Sonata's table", () => {
  it("spells each tone above the root", () => {
    expect(label("0:4-3-7/0").text).toBe("I(3,5,9)");
    expect(label("0:7/0").text).toBe("I(5)");
    expect(label("0:/0").text).toBe("I(1)");
  });

  it("lowercases a stack with a minor third and no major one", () => {
    expect(label("9:3-4-7/0")).toEqual({
      numeral: "vi",
      suffix: "(♭3,5,9)",
      figure: "",
      text: "vi(♭3,5,9)",
    });
  });
});

describe("chordLabel — total", () => {
  it("labels every template on every root, in every inversion", () => {
    for (const template of CHORD_TEMPLATES) {
      const intervals = template.intervals.map(
        (above, i) => above - (template.intervals[i - 1] ?? 0),
      );
      for (let root = 0; root < 12; root++) {
        for (let inversion = 0; inversion <= intervals.length; inversion++) {
          const token = chordTokenFromParts({ root, intervals, inversion });
          const l = chordLabel(token);
          expect(l.text).toBe(l.numeral + l.suffix + l.figure);
          expect(l.numeral).toMatch(/^[♭♯]?(?:[IV]+|[iv]+)$/);
        }
      }
    }
  });
});
