import { describe, expect, it } from "bun:test";
import { parseGrid } from "./parse-grid";

/** Symbols of the parsed chord events, in order. */
const symbols = (text: string) =>
  parseGrid(text).events.map((e) => e.data.symbol);

describe("parseGrid — parenthetical alterations", () => {
  it("keeps a chord's attached (…) as one token, not a group", () => {
    const { events, skipped } = parseGrid("G7(♯5)");
    expect(skipped).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]!.data.symbol).toBe("G7(♯5)");
  });

  it("parses the three previously-unrecognised chords in one grid", () => {
    const { events, skipped } = parseGrid("Eb6/9 G7(♯5) Gsus4(♭9)");
    expect(skipped).toEqual([]);
    expect(events.map((e) => e.data.symbol)).toEqual([
      "Eb6/9",
      "G7(♯5)",
      "Gsus4(♭9)",
    ]);
  });

  it("still treats a boundary ( as a bar group", () => {
    const { events, skipped } = parseGrid("(E E6)");
    expect(skipped).toEqual([]);
    // One bar split equally between the two chords.
    expect(events.map((e) => e.data.symbol)).toEqual(["E", "E6"]);
    expect(events[0]!.end - events[0]!.start).toBe(2);
  });

  it("nests an altered chord inside a group", () => {
    const { events, skipped } = parseGrid("(G7(♯5) A)");
    expect(skipped).toEqual([]);
    expect(events.map((e) => e.data.symbol)).toEqual(["G7(♯5)", "A"]);
  });

  it("preserves the empty () spacer as an empty bar", () => {
    const { events, skipped } = parseGrid("C\n()\nF");
    expect(skipped).toEqual([]);
    expect(events.map((e) => e.data.symbol)).toEqual(["C", "F"]);
    // The spacer bar sits between them (F starts two bars after C).
    expect(events[1]!.start - events[0]!.start).toBe(8);
  });

  it("still skips a genuine typo carrying parens", () => {
    const { skipped } = parseGrid("Zx(♯5)");
    expect(skipped).toEqual(["Zx(♯5)"]);
  });
});

describe("parseGrid — regression", () => {
  it("parses a plain progression unchanged", () => {
    expect(symbols("C G Am F")).toEqual(["C", "G", "Am", "F"]);
  });
});
