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

describe("parseGrid — comments", () => {
  it("ignores a whole-line comment", () => {
    const { events, skipped } = parseGrid("# verse\nC G");
    expect(skipped).toEqual([]);
    expect(events.map((e) => e.data.symbol)).toEqual(["C", "G"]);
    // The comment consumes no bar — C still starts the grid.
    expect(events[0]!.start).toBe(0);
  });

  it("ignores a trailing comment after a bar", () => {
    expect(symbols("C G # turnaround\nAm F")).toEqual(["C", "G", "Am", "F"]);
  });

  it("does not glue the next line into the commented cell", () => {
    const { events } = parseGrid("C # aside\nG");
    expect(events.map((e) => e.data.symbol)).toEqual(["C", "G"]);
    expect(events[1]!.start).toBe(4);
  });

  it("comments out chords that would otherwise sound", () => {
    const { events, skipped } = parseGrid("C\n# Am F\nG");
    expect(skipped).toEqual([]);
    expect(events.map((e) => e.data.symbol)).toEqual(["C", "G"]);
    // G is the second bar — the commented line contributed no bars.
    expect(events[1]!.start).toBe(4);
  });

  it("treats a comment-only grid as empty, not as a typo", () => {
    const { events, skipped } = parseGrid("# nothing here yet");
    expect(events).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("terminates a comment at end-of-text without a newline", () => {
    expect(symbols("C G #")).toEqual(["C", "G"]);
  });

  it("comments after the optional | bar separator", () => {
    expect(symbols("| C  G | # tail")).toEqual(["C", "G"]);
  });

  it("comments inside a group, without breaking the group", () => {
    const { events, skipped } = parseGrid("(C # first half\n G)");
    expect(skipped).toEqual([]);
    expect(events.map((e) => e.data.symbol)).toEqual(["C", "G"]);
    // Still one shared bar: two beats each.
    expect(events[0]!.end - events[0]!.start).toBe(2);
  });
});

describe("parseGrid — # does double duty (comment vs. sharp)", () => {
  it("keeps a sharp inside a chord root", () => {
    expect(symbols("F#m C#7")).toEqual(["F#m", "C#7"]);
  });

  it("keeps a sharp inside an attached alteration", () => {
    const { events, skipped } = parseGrid("G7(#5)");
    expect(skipped).toEqual([]);
    // The theory layer canonicalizes the ASCII `#` alteration to `♯`.
    expect(events[0]!.data.symbol).toBe("G7(♯5)");
  });

  it("keeps a sharp on the first chord of a group", () => {
    expect(symbols("(C#m E)")).toEqual(["C#m", "E"]);
  });

  it("keeps a sharp after a hold", () => {
    expect(symbols("C . F#m")).toEqual(["C", "F#m"]);
  });

  it("still fails loud on a typo carrying a mid-token #", () => {
    expect(parseGrid("Zx#9").skipped).toEqual(["Zx#9"]);
  });
});

describe("parseGrid — regression", () => {
  it("parses a plain progression unchanged", () => {
    expect(symbols("C G Am F")).toEqual(["C", "G", "Am", "F"]);
  });
});
