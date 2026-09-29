import { describe, expect, test } from "bun:test";
import {
  delimiterCell,
  escapeCell,
  fitRow,
  formatRow,
  parseDelimiterRow,
  splitRow,
  unescapeCell,
} from "./gfm-table";

// The two protected-span shapes the editor registers (inline math, and a
// bracketed page link), spelled here so the suite needs no registry.
const SPANS = [/\\\((.+?)\\\)/, /\[\[page:[^\]\s]+\]\]/];

describe("splitRow", () => {
  test("leading and trailing pipes frame the row", () => {
    expect(splitRow("| a | b |", [])).toEqual([" a ", " b "]);
  });

  test("the trailing pipe is optional", () => {
    expect(splitRow("| a | b", [])).toEqual([" a ", " b"]);
  });

  test("an empty cell is still a cell", () => {
    expect(splitRow("| a |  |", [])).toEqual([" a ", "  "]);
    expect(splitRow("|  |", [])).toEqual(["  "]);
    expect(splitRow("|", [])).toEqual([""]);
  });

  test("an escaped pipe does not split", () => {
    expect(splitRow("| a \\| b | c |", [])).toEqual([" a \\| b ", " c "]);
  });

  test("a backslash PAIR is one unit: `\\\\|` is a literal backslash, then a separator", () => {
    expect(splitRow("| a\\\\| b |", [])).toEqual([" a\\\\", " b "]);
  });

  test("a pipe inside a protected span does not split", () => {
    expect(splitRow("| \\(a|b\\) | c |", SPANS)).toEqual([
      " \\(a|b\\) ",
      " c ",
    ]);
    expect(splitRow("| [[page:a|b]] | c |", [/\[\[page:[^\]]+\]\]/])).toEqual([
      " [[page:a|b]] ",
      " c ",
    ]);
  });

  test("a span is matched where the scan stands, never across a cell boundary", () => {
    // `\\(a` and `b\\)` are two escaped backslashes in two cells; a global
    // search over the row would read `\(a | b\\)` as one math span.
    expect(splitRow("| \\\\(a | b\\\\) |", SPANS)).toEqual([
      " \\\\(a ",
      " b\\\\) ",
    ]);
  });
});

describe("escapeCell / unescapeCell", () => {
  const roundTrip = (md: string): string =>
    unescapeCell(escapeCell(md, SPANS), SPANS);

  test("a pipe is escaped, and comes back", () => {
    expect(escapeCell("a|b", [])).toBe("a\\|b");
    expect(roundTrip("a|b")).toBe("a|b");
  });

  test("an inline backslash pair is left alone around a pipe", () => {
    // The inline layer spells a literal backslash `\\`; the pipe after it is a
    // real pipe and gets its own escape.
    expect(escapeCell("a\\\\|b", [])).toBe("a\\\\\\|b");
    expect(roundTrip("a\\\\|b")).toBe("a\\\\|b");
  });

  test("a pipe inside a protected span stays verbatim", () => {
    expect(escapeCell("\\(a|b\\)", SPANS)).toBe("\\(a|b\\)");
    expect(roundTrip("x \\(a|b\\) y|z")).toBe("x \\(a|b\\) y|z");
  });

  test("a cell that reads as a delimiter cell is escaped", () => {
    for (const cell of ["---", ":--", "--:", ":-:", "-"]) {
      expect(escapeCell(cell, [])).toBe("\\" + cell);
      expect(parseDelimiterRow(formatRow([escapeCell(cell, [])]), [])).toBe(
        null,
      );
      expect(roundTrip(cell)).toBe(cell);
    }
  });

  test("unescape trims the cell", () => {
    expect(unescapeCell("  a  ", [])).toBe("a");
  });

  test("other backslash pairs belong to the inline layer and pass through", () => {
    expect(unescapeCell("\\*x\\*", [])).toBe("\\*x\\*");
  });
});

describe("delimiter row", () => {
  test("parses alignments", () => {
    expect(parseDelimiterRow("| --- | :-- | --: | :-: |", [])).toEqual([
      null,
      "left",
      "right",
      "center",
    ]);
  });

  test("tolerates GFM's looser spellings", () => {
    expect(parseDelimiterRow("|-|:--------:|", [])).toEqual([null, "center"]);
    expect(parseDelimiterRow("| - | - |", [])).toEqual([null, null]);
  });

  test("anything else is not a delimiter row", () => {
    expect(parseDelimiterRow("| a | --- |", [])).toBeNull();
    expect(parseDelimiterRow("| : |", [])).toBeNull();
    expect(parseDelimiterRow("|  |", [])).toBeNull();
  });

  test("emit ⇄ parse", () => {
    const aligns = [null, "left", "right", "center"] as const;
    expect(parseDelimiterRow(formatRow(aligns.map(delimiterCell)), [])).toEqual(
      [...aligns],
    );
  });
});

describe("fitRow", () => {
  test("pads and truncates to the width", () => {
    expect(fitRow(["a"], 3)).toEqual(["a", "", ""]);
    expect(fitRow(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
});
