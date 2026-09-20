import { describe, expect, it } from "bun:test";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordDigit, chordKeyPlan, pickPage, type ChordDigit } from "./keys";

const token = (text: string) => ChordTokenSchema.parse(text);

describe("chordDigit", () => {
  const cases: [string, ChordDigit][] = [
    ["0:4-3/0", "1"], // I
    ["2:3-4/0", "2"], // ii
    ["4:3-4/0", "3"], // iii
    ["5:4-3/0", "4"], // IV
    ["7:4-3/0", "5"], // V
    ["9:3-4/0", "6"], // vi
    ["11:3-3/0", "7"], // vii°
  ];
  for (const [text, digit] of cases) {
    it(`${text} is on the ${digit} key`, () => {
      expect(chordDigit(token(text))).toBe(digit);
    });
  }

  it("ignores the accidental: a flattened or raised degree keeps its letter", () => {
    expect(chordDigit(token("10:4-3/0"))).toBe("7"); // ♭VII
    expect(chordDigit(token("3:4-3/0"))).toBe("3"); // ♭III
    expect(chordDigit(token("8:4-3/0"))).toBe("6"); // ♭VI
    expect(chordDigit(token("1:4-3/0"))).toBe("2"); // ♭II
    expect(chordDigit(token("6:3-3/0"))).toBe("4"); // ♯iv°
  });

  it("ignores the stack and the inversion: only the root is read", () => {
    expect(chordDigit(token("7:4-3-3/2"))).toBe("5"); // V43
    expect(chordDigit(token("7:5-2/0"))).toBe("5"); // Vsus4
  });

  it("has one for every root", () => {
    for (let root = 0; root < 12; root++) {
      expect(chordDigit(token(`${root}:4-3/0`))).toMatch(/^[1-7]$/);
    }
  });
});

describe("chordKeyPlan", () => {
  it("groups the chords by their key, digits ascending", () => {
    const plan = chordKeyPlan(["7:4-3/0", "0:4-3/0", "5:4-3/0"].map(token));
    expect(plan).toEqual([
      { digit: "1", tokens: [token("0:4-3/0")] },
      { digit: "4", tokens: [token("5:4-3/0")] },
      { digit: "5", tokens: [token("7:4-3/0")] },
    ]);
  });

  it("keeps several chords on one digit in the order given", () => {
    const plan = chordKeyPlan(
      ["7:4-3/0", "0:4-3/0", "7:4-3-3/0", "7:4-3/1"].map(token),
    );
    expect(plan).toEqual([
      { digit: "1", tokens: [token("0:4-3/0")] },
      {
        digit: "5",
        tokens: [token("7:4-3/0"), token("7:4-3-3/0"), token("7:4-3/1")],
      },
    ]);
  });

  it("puts ♭VII and vii° on the same key", () => {
    const plan = chordKeyPlan(["10:4-3/0", "11:3-3/0"].map(token));
    expect(plan).toEqual([
      { digit: "7", tokens: [token("10:4-3/0"), token("11:3-3/0")] },
    ]);
  });

  it("leaves out a digit nothing sits on, and an empty set has no groups", () => {
    expect(chordKeyPlan([token("0:4-3/0")]).map((g) => g.digit)).toEqual(["1"]);
    expect(chordKeyPlan([])).toEqual([]);
  });
});

describe("pickPage", () => {
  /** `n` distinct chords on one digit: the 5, with more and more stacked on it. */
  const chords = (n: number) =>
    Array.from({ length: n }, (_, i) => token(`7:${4 + i}-3/0`));

  /** The numbers as a plain list, so a page reads in order. */
  const reached = (tokens: readonly ReturnType<typeof token>[], page: number) =>
    [...pickPage(tokens, page).numbers].map(([t, digit]) => `${digit}:${t}`);

  it("gives every chord its own key while they fit", () => {
    for (const n of [1, 2, 7]) {
      const tokens = chords(n);
      const { numbers, pager } = pickPage(tokens, 0);
      expect(pager).toBeNull();
      expect([...numbers.keys()]).toEqual(tokens);
      expect([...numbers.values()].join("")).toBe("1234567".slice(0, n));
    }
  });

  it("ignores the page while everything is in reach", () => {
    const tokens = chords(7);
    expect(reached(tokens, 3)).toEqual(reached(tokens, 0));
  });

  it("keeps the last key for paging once there are more chords than keys", () => {
    const tokens = chords(8);
    expect(pickPage(tokens, 0).pager).toBe("7");
    expect(pickPage(tokens, 1).pager).toBe("7");
    expect(reached(tokens, 0)).toEqual([
      `1:${tokens[0]}`,
      `2:${tokens[1]}`,
      `3:${tokens[2]}`,
      `4:${tokens[3]}`,
      `5:${tokens[4]}`,
      `6:${tokens[5]}`,
    ]);
    // The short last page numbers what it has, from 1.
    expect(reached(tokens, 1)).toEqual([`1:${tokens[6]}`, `2:${tokens[7]}`]);
  });

  it("reaches every chord across the pages, each on exactly one", () => {
    for (const n of [8, 13, 15]) {
      const tokens = chords(n);
      const pageCount = Math.ceil(n / 6);
      const seen = new Set<string>();
      for (let page = 0; page < pageCount; page++) {
        for (const t of pickPage(tokens, page).numbers.keys()) {
          expect(seen.has(t)).toBe(false);
          seen.add(t);
        }
      }
      expect(seen.size).toBe(n);
    }
  });

  it("wraps, so a caller can just keep incrementing", () => {
    const tokens = chords(13);
    expect(reached(tokens, 3)).toEqual(reached(tokens, 0));
    expect(reached(tokens, -1)).toEqual(reached(tokens, 2));
    expect(reached(tokens, 100)).toEqual(reached(tokens, 1));
  });

  it("refuses a digit with no chords, and a page that is not a whole number", () => {
    expect(() => pickPage([], 0)).toThrow(/answers nothing/);
    expect(() => pickPage(chords(3), 0.5)).toThrow(/whole number/);
  });
});
