/**
 * Pure unit tests for the inline markdown delimiter matcher
 * (`inline-markdown.ts`).
 * Run with `bun test plugins/page/plugins/editor/core/inline-markdown.test.ts`.
 */

import { test, expect, describe } from "bun:test";
import {
  INLINE_SYNTAXES,
  matchInlineFormat,
  type InlineFormatMatch,
} from "./inline-markdown";
import { MARK_ORDER, sortMarks } from "./rich-text";

/**
 * The string-level transform the web surgery performs: drop both delimiters,
 * keep the content. Used by the idempotence pin below, and the reason the match
 * carries indices rather than a substring.
 */
function stripDelimiters(text: string, m: InlineFormatMatch): string {
  return (
    text.slice(0, m.openStart) +
    text.slice(m.openStart + m.tagLength, m.closeStart) +
    text.slice(m.closeStart + m.tagLength)
  );
}

describe("matchInlineFormat — positives", () => {
  test("**x** → bold", () => {
    expect(matchInlineFormat("**x**")).toEqual({
      openStart: 0,
      closeStart: 3,
      tagLength: 2,
      marks: ["bold"],
    });
  });

  test("mid-line: hello **world**", () => {
    expect(matchInlineFormat("hello **world**")).toEqual({
      openStart: 6,
      closeStart: 13,
      tagLength: 2,
      marks: ["bold"],
    });
  });

  test("*x* → italic", () => {
    expect(matchInlineFormat("*x*")).toEqual({
      openStart: 0,
      closeStart: 2,
      tagLength: 1,
      marks: ["italic"],
    });
  });

  test("_x_ at line start (no ctx — undefined flanks are permissive)", () => {
    expect(matchInlineFormat("_x_")).toEqual({
      openStart: 0,
      closeStart: 2,
      tagLength: 1,
      marks: ["italic"],
    });
  });

  test("a _x_ — space before the opener satisfies the left flank", () => {
    expect(matchInlineFormat("a _x_")).toEqual({
      openStart: 2,
      closeStart: 4,
      tagLength: 1,
      marks: ["italic"],
    });
  });

  test("_x_ with charBefore '(' — punctuation satisfies the left flank", () => {
    expect(matchInlineFormat("_x_", { charBefore: "(" })).toEqual({
      openStart: 0,
      closeStart: 2,
      tagLength: 1,
      marks: ["italic"],
    });
  });

  test("***x*** → bold + italic in one keystroke (longest tag wins)", () => {
    expect(matchInlineFormat("***x***")).toEqual({
      openStart: 0,
      closeStart: 4,
      tagLength: 3,
      marks: ["bold", "italic"],
    });
  });

  test("___x___ → bold + italic", () => {
    expect(matchInlineFormat("___x___")).toEqual({
      openStart: 0,
      closeStart: 4,
      tagLength: 3,
      marks: ["bold", "italic"],
    });
  });

  test("~~x~~ → strikethrough", () => {
    expect(matchInlineFormat("~~x~~")).toEqual({
      openStart: 0,
      closeStart: 3,
      tagLength: 2,
      marks: ["strikethrough"],
    });
  });

  test("`x` → code", () => {
    expect(matchInlineFormat("`x`")).toEqual({
      openStart: 0,
      closeStart: 2,
      tagLength: 1,
      marks: ["code"],
    });
  });

  test("a*b* — intraword star IS emphasis in CommonMark", () => {
    expect(matchInlineFormat("a*b*")).toEqual({
      openStart: 1,
      closeStart: 3,
      tagLength: 1,
      marks: ["italic"],
    });
  });

  test("**two words** — the span may contain spaces", () => {
    expect(matchInlineFormat("**two words**")).toEqual({
      openStart: 0,
      closeStart: 11,
      tagLength: 2,
      marks: ["bold"],
    });
  });

  test("**x.** — punctuation before the closer is not whitespace", () => {
    expect(matchInlineFormat("**x.**")).toEqual({
      openStart: 0,
      closeStart: 4,
      tagLength: 2,
      marks: ["bold"],
    });
  });

  test("`a*b*` → the CODE row over the inner italic (whole span, openStart 0)", () => {
    expect(matchInlineFormat("`a*b*`")).toEqual({
      openStart: 0,
      closeStart: 5,
      tagLength: 1,
      marks: ["code"],
    });
  });

  test("**a *b* → the NEAREST opener, so only `b` italicizes", () => {
    // "**a *b*" — the inner `*` sits at index 4 ("*","*","a"," ","*","b","*").
    expect(matchInlineFormat("**a *b*")).toEqual({
      openStart: 4,
      closeStart: 6,
      tagLength: 1,
      marks: ["italic"],
    });
  });
});

describe("matchInlineFormat — negatives", () => {
  test("** — empty content (this is what makes `**` typable at all)", () => {
    expect(matchInlineFormat("**")).toBe(null);
  });

  test("**** — every row degenerates to empty content", () => {
    expect(matchInlineFormat("****")).toBe(null);
  });

  test("** x** — a space after the opener cancels it", () => {
    expect(matchInlineFormat("** x**")).toBe(null);
  });

  test("**x ** — whitespace before the closer", () => {
    expect(matchInlineFormat("**x **")).toBe(null);
  });

  test("**b* — MID-TYPING toward `**b**`: the repeating-char rule keeps it inert", () => {
    expect(matchInlineFormat("**b*")).toBe(null);
  });

  test("***b** — repeating-char rule stops `**` stealing `***`", () => {
    expect(matchInlineFormat("***b**")).toBe(null);
  });

  test("snake_case_ — `_` refuses an alphanumeric left flank", () => {
    expect(matchInlineFormat("snake_case_")).toBe(null);
  });

  test("a__b__ — same rule for the `__` row", () => {
    expect(matchInlineFormat("a__b__")).toBe(null);
  });

  test("_x_ with charAfter 'y' — `_` refuses an alphanumeric right flank", () => {
    expect(matchInlineFormat("_x_", { charAfter: "y" })).toBe(null);
  });

  test("_x_ with charBefore 'a' — the flank the fragment cannot see", () => {
    expect(matchInlineFormat("_x_", { charBefore: "a" })).toBe(null);
  });

  test("_ x_ — a space after the opener cancels it", () => {
    expect(matchInlineFormat("_ x_")).toBe(null);
  });

  test("`a**b** — an unclosed code span beats bold (CommonMark precedence)", () => {
    expect(matchInlineFormat("`a**b**")).toBe(null);
  });

  test("x — a plain letter closes nothing", () => {
    expect(matchInlineFormat("x")).toBe(null);
  });

  test("~x~ — a single `~` is not a delimiter", () => {
    expect(matchInlineFormat("~x~")).toBe(null);
  });

  test("==x== — highlight has no corresponding Mark, so no row", () => {
    expect(matchInlineFormat("==x==")).toBe(null);
  });

  test("**a\\nb** — the clamp makes a match structurally unable to span a line", () => {
    expect(matchInlineFormat("**a\nb**")).toBe(null);
  });

  test("`` — empty code content, which is what keeps ``` reachable", () => {
    expect(matchInlineFormat("``")).toBe(null);
  });
});

describe("INLINE_SYNTAXES — decision pins on the table itself", () => {
  test("rows are in non-increasing tag-length order (the precedence rule IS the order)", () => {
    const lengths = INLINE_SYNTAXES.map((row) => row.tag.length);
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i - 1]!).toBeGreaterThanOrEqual(lengths[i]!);
    }
  });

  test("tags are 1..3 chars of one repeated character", () => {
    for (const row of INLINE_SYNTAXES) {
      expect(row.tag.length).toBeGreaterThanOrEqual(1);
      expect(row.tag.length).toBeLessThanOrEqual(3);
      expect(row.tag).toBe(row.tag[0]!.repeat(row.tag.length));
    }
  });

  test("every row's marks is a non-empty, canonically-sorted subset of MARK_ORDER", () => {
    for (const row of INLINE_SYNTAXES) {
      expect(row.marks.length).toBeGreaterThan(0);
      expect([...row.marks]).toEqual(sortMarks(row.marks));
      for (const mark of row.marks) expect(MARK_ORDER).toContain(mark);
    }
  });

  test("the union of all rows' marks is exactly MARK_ORDER minus 'underline'", () => {
    // Markdown has no underline syntax, so underline declares no delimiter and
    // stays Cmd+U. The point of asserting the union rather than just the absence:
    // adding a SIXTH Mark fails this test until someone decides its syntax (or
    // deliberately lists it as delimiter-less), instead of silently shipping a
    // mark no one can type.
    const union = sortMarks(INLINE_SYNTAXES.flatMap((row) => [...row.marks]));
    const expected = MARK_ORDER.filter((m) => m !== "underline");
    expect(union).toEqual(expected);
  });

  test("string-level idempotence: every row transforms `tag x tag` to plain `x`, which re-matches nothing", () => {
    for (const row of INLINE_SYNTAXES) {
      const typed = `${row.tag}x${row.tag}`;
      const match = matchInlineFormat(typed);
      expect(match).not.toBe(null);
      // The row that won is this row — longest-tag-first must not hand `__x__`
      // to the `_` row.
      expect(match!.tagLength).toBe(row.tag.length);
      expect(match!.marks).toEqual(sortMarks(row.marks));
      // Stands in for the "no re-fire" guarantee at the pure level: the
      // post-transform text carries no delimiters left to match.
      expect(stripDelimiters(typed, match!)).toBe("x");
      expect(matchInlineFormat("x")).toBe(null);
    }
  });
});
