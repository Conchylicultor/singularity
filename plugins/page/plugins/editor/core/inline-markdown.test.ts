/**
 * Pure unit tests for the inline markdown delimiter matcher
 * (`inline-markdown.ts`).
 * Run with `bun test plugins/page/plugins/editor/core/inline-markdown.test.ts`.
 */

import { test, expect, describe } from "bun:test";
import {
  INLINE_SYNTAXES,
  matchInlineFormat,
  parseInlineMarkdown,
  serializeInlineMarkdown,
  type InlineFormatMatch,
} from "./inline-markdown";
import { MARK_ORDER, sortMarks, type RichText } from "./rich-text";

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

// ---------------------------------------------------------------------------
// Whole-string serialize / parse
// ---------------------------------------------------------------------------

/**
 * The real token patterns, transcribed rather than imported: they live in the
 * inline-date / inline-page-link / math-inline plugins' `core/tokens.ts` — the
 * single source of truth for each — and importing one here would form a plugin
 * import cycle the boundary checker catches (each of those imports the editor
 * core). The shapes are what matters — `\(latex\)` in particular is FULL of `_`
 * and `*`. A transcription can go stale, so keep the body UNCONSTRAINED the way
 * the real page-link pattern does: its namespace prefix, not the id's shape, is
 * what makes it a token.
 */
const LATEX = /\\\(([^\n]*?)\\\)/;
const PAGE_TOKEN = /\[\[page:([^[\]\n]+)\]\]/;
const DATE_TOKEN = /\[\[date:([0-9T:.Z-]+)\]\]/;
const TOKENS = [LATEX, PAGE_TOKEN, DATE_TOKEN];

const ser = (runs: RichText, tokens: RegExp[] = []): string =>
  serializeInlineMarkdown(runs, tokens);
const par = (text: string, tokens: RegExp[] = []): RichText =>
  parseInlineMarkdown(text, tokens);

describe("serializeInlineMarkdown — every mark, color, link", () => {
  test("EVERY mark the table delimits is serializable, and code is innermost", () => {
    // The serializer's nesting list is hand-ordered (the order is the decision);
    // this is what fails if a sixth mark joins the table and nobody adds it —
    // rather than that mark silently vanishing on copy.
    for (const row of INLINE_SYNTAXES) {
      for (const mark of row.marks) {
        expect(ser([{ text: "x", marks: [mark] }])).not.toBe("x");
      }
    }
    // Code last: a code span's content is verbatim, so anything emitted inside
    // one would never parse back.
    expect(ser([{ text: "x", marks: ["bold", "code"] }])).toBe("**`x`**");
  });

  test("one delimiter per mark, `<u>` for the delimiter-less one", () => {
    expect(ser([{ text: "x", marks: ["bold"] }])).toBe("**x**");
    expect(ser([{ text: "x", marks: ["italic"] }])).toBe("*x*");
    expect(ser([{ text: "x", marks: ["strikethrough"] }])).toBe("~~x~~");
    expect(ser([{ text: "x", marks: ["code"] }])).toBe("`x`");
    expect(ser([{ text: "x", marks: ["underline"] }])).toBe("<u>x</u>");
  });

  test("bold+italic collapses to the table's `***` row, not nested spans", () => {
    expect(ser([{ text: "x", marks: ["bold", "italic"] }])).toBe("***x***");
    expect(par("***x***")).toEqual([{ text: "x", marks: ["bold", "italic"] }]);
  });

  test("all five marks nest in one fixed order, code innermost", () => {
    const all: RichText = [{ text: "x", marks: [...MARK_ORDER] }];
    expect(ser(all)).toBe("<u>***~~`x`~~***</u>");
    expect(par(ser(all))).toEqual(all);
  });

  test("color is a tag (it is a run ATTRIBUTE, not a mark)", () => {
    expect(ser([{ text: "x", color: "blue" }])).toBe(
      '<color value="blue">x</color>',
    );
    expect(par('<color value="blue">x</color>')).toEqual([
      { text: "x", color: "blue" },
    ]);
  });

  test("`default` color emits nothing", () => {
    expect(ser([{ text: "x", color: "default" }])).toBe("x");
  });

  test("link is `[text](url)`, outermost, with `)` escaped in the url", () => {
    expect(ser([{ text: "x", link: "https://a.io" }])).toBe(
      "[x](https://a.io)",
    );
    // Only `\` and `)` are escaped in a URL — a URL is read verbatim up to its
    // first UNESCAPED `)`, so `(` needs nothing.
    expect(
      ser([{ text: "x", link: "https://a.io/p(1)", marks: ["bold"] }]),
    ).toBe("[**x**](https://a.io/p(1\\))");
    expect(par("[**x**](https://a.io/p(1\\))")).toEqual([
      { text: "x", marks: ["bold"], link: "https://a.io/p(1)" },
    ]);
  });

  test("a shared mark wraps the whole RUN of runs that carry it", () => {
    const runs: RichText = [
      { text: "a", marks: ["bold"] },
      { text: "b", marks: ["bold", "italic"] },
      { text: "c", marks: ["bold"] },
    ];
    expect(ser(runs)).toBe("**a*b*c**");
    expect(par("**a*b*c**")).toEqual(runs);
  });
});

describe("parseInlineMarkdown — marks are a per-run SET, never a tree", () => {
  test("`**a *b* c**` flattens to three runs whose marks are UNIONS", () => {
    expect(par("**a *b* c**")).toEqual([
      { text: "a ", marks: ["bold"] },
      { text: "b", marks: ["bold", "italic"] },
      { text: " c", marks: ["bold"] },
    ]);
  });

  test("marks land in MARK_ORDER regardless of nesting order", () => {
    expect(par("`<u>x</u>`")).toEqual(par("`<u>x</u>`"));
    expect(par("<u>**x**</u>")).toEqual([
      { text: "x", marks: ["bold", "underline"] },
    ]);
    expect(par("**<u>x</u>**")).toEqual([
      { text: "x", marks: ["bold", "underline"] },
    ]);
  });

  test("output is canonical: coalesced, no zero-length runs", () => {
    // Two adjacent spans with identical attributes merge into ONE run.
    expect(par("<u>a</u><u>b</u>")).toEqual([
      { text: "ab", marks: ["underline"] },
    ]);
    expect(par("")).toEqual([]);
  });

  test("a bare run of delimiter characters is literal (the whole-run rule)", () => {
    expect(par("****")).toEqual([{ text: "****" }]);
    expect(par("***")).toEqual([{ text: "***" }]);
    expect(par("~~~~")).toEqual([{ text: "~~~~" }]);
  });

  test("a code span's content is verbatim (CommonMark precedence)", () => {
    expect(par("`a*b*c`")).toEqual([{ text: "a*b*c", marks: ["code"] }]);
  });

  test("`_` keeps its intra-word refusal, so identifiers survive", () => {
    expect(par("snake_case_name")).toEqual([{ text: "snake_case_name" }]);
    expect(par("a _b_ c")).toEqual([
      { text: "a " },
      { text: "b", marks: ["italic"] },
      { text: " c" },
    ]);
  });

  test("a space inside the delimiters cancels it, so arithmetic survives", () => {
    expect(par("2 * 3 * 4")).toEqual([{ text: "2 * 3 * 4" }]);
    expect(par("5 ** 6 ** 7")).toEqual([{ text: "5 ** 6 ** 7" }]);
  });

  test("unmatched delimiters, tags and brackets stay literal", () => {
    expect(par("**unclosed")).toEqual([{ text: "**unclosed" }]);
    expect(par("<u>unclosed")).toEqual([{ text: "<u>unclosed" }]);
    expect(par("[text] (not a link)")).toEqual([
      { text: "[text] (not a link)" },
    ]);
    expect(par("[x]()")).toEqual([{ text: "[x]()" }]);
  });

  test("an unrecognized color is literal text, not a failure", () => {
    expect(par('<color value="chartreuse">z</color>')).toEqual([
      { text: '<color value="chartreuse">z</color>' },
    ]);
  });

  test("a delimiter can never span a line break", () => {
    expect(par("**a\nb**")).toEqual([{ text: "**a\nb**" }]);
  });
});

describe("escaping — the rule that makes serialize → parse an identity", () => {
  test("every character that could open a construct is backslash-escaped", () => {
    const raw = "a*b_c~d`e[f]g<h>i\\j";
    expect(ser([{ text: raw }])).toBe("a\\*b\\_c\\~d\\`e\\[f\\]g\\<h>i\\\\j");
    expect(par(ser([{ text: raw }]))).toEqual([{ text: raw }]);
  });

  test("`>`, `(` and `)` are NOT escaped — they open nothing inline", () => {
    expect(ser([{ text: "f(x) > y" }])).toBe("f(x) > y");
  });

  test("an escaped delimiter cannot close a span", () => {
    expect(par("**a\\*\\*b**")).toEqual([{ text: "a**b", marks: ["bold"] }]);
  });

  test("a backslash before a non-escapable character stays literal", () => {
    expect(par("C:\\path\\to")).toEqual([{ text: "C:\\path\\to" }]);
  });

  test("escaping survives inside a code span", () => {
    expect(ser([{ text: "a`b", marks: ["code"] }])).toBe("`a\\`b`");
    expect(par("`a\\`b`")).toEqual([{ text: "a`b", marks: ["code"] }]);
  });
});

describe("protected spans — the reason `protectedSpans` exists", () => {
  test("a `\\(a*b*\\)` LaTeX token survives VERBATIM, unmarked", () => {
    const token = "\\(a*b*\\)";
    expect(ser([{ text: token }], TOKENS)).toBe(token);
    expect(par(token, TOKENS)).toEqual([{ text: token }]);
  });

  test("without protection the same token would be mangled by `*`", () => {
    // The negative control: this is what the parameter prevents.
    expect(par("\\(a*b*\\)", [])).not.toEqual([{ text: "\\(a*b*\\)" }]);
  });

  test("no delimiter may open or close INSIDE a protected span", () => {
    // The token's neighbours are unmarked too, so `coalesce` merges the three
    // runs back into one — the point is that the `_`s did NOT italicize.
    expect(par("x \\(a*b*c\\) y", TOKENS)).toEqual([
      { text: "x \\(a*b*c\\) y" },
    ]);
    expect(par("x \\(a*b*c\\) y", [])).not.toEqual([
      { text: "x \\(a*b*c\\) y" },
    ]);
    // `_` inside a token is doubly safe (the intra-word rule also declines it),
    // but `*` is intraword-legal, which is what makes the masking load-bearing.
    expect(par("x \\(a_b_c\\) y", TOKENS)).toEqual([
      { text: "x \\(a_b_c\\) y" },
    ]);
  });

  test("`[[page:block-1-x]]` is never split, and never escaped on the way out", () => {
    const runs: RichText = [{ text: "see [[page:block-1-x]] here" }];
    expect(ser(runs, TOKENS)).toBe("see [[page:block-1-x]] here");
    expect(par("see [[page:block-1-x]] here", TOKENS)).toEqual(runs);
  });

  test("a mark is not applied ACROSS a token — it becomes its own unmarked run", () => {
    // Exactly what `runs-lexical.ts`'s `walkNode` produces for a decorator node,
    // so this is the canonical form rather than a loss.
    expect(par("**see [[page:block-1-x]] here**", TOKENS)).toEqual([
      { text: "see ", marks: ["bold"] },
      { text: "[[page:block-1-x]]" },
      { text: " here", marks: ["bold"] },
    ]);
    expect(
      ser([{ text: "see [[page:block-1-x]] here", marks: ["bold"] }], TOKENS),
    ).toBe("**see** [[page:block-1-x]] **here**");
  });

  test("a token inherits an enclosing LINK, as the Lexical walk does", () => {
    // `link` matches its neighbours' so the runs coalesce; what proves the
    // inheritance is that the token's run carries the link at all.
    expect(par("[a [[date:2026-08-03]] b](u)", TOKENS)).toEqual([
      { text: "a [[date:2026-08-03]] b", link: "u" },
    ]);
    // With a MARK around it the token stands alone, unmarked but still linked.
    expect(par("[**a [[date:2026-08-03]] b**](u)", TOKENS)).toEqual([
      { text: "a ", marks: ["bold"], link: "u" },
      { text: "[[date:2026-08-03]]", link: "u" },
      { text: " b", marks: ["bold"], link: "u" },
    ]);
  });

  test("a token is honored inside a code span too", () => {
    expect(par("`\\(x\\)`", TOKENS)).toEqual([{ text: "\\(x\\)" }]);
  });
});

describe("round trip — parse ∘ serialize is the identity on canonical runs", () => {
  const canonical: RichText[] = [
    [{ text: "plain text" }],
    [{ text: "x", marks: ["bold"] }],
    [{ text: "x", marks: ["bold", "italic"] }],
    [{ text: "x", marks: [...MARK_ORDER] }],
    [
      { text: "a", marks: ["bold"] },
      { text: "b", marks: ["bold", "italic"] },
      { text: "c", marks: ["bold"] },
    ],
    [{ text: "x", color: "red" }],
    [{ text: "x", color: "green", marks: ["bold"] }],
    [{ text: "x", link: "https://a.io/p(1)" }],
    [{ text: "x", link: "https://a.io", marks: ["bold", "underline"] }],
    [{ text: "a*b_c~d`e[f]g<h>i\\j" }],
    [{ text: "2 * 3 * 4 and snake_case_name" }],
    [
      { text: "a", marks: ["bold"] },
      { text: " " },
      { text: "b", marks: ["code"] },
    ],
  ];

  for (const runs of canonical) {
    test(`identity: ${JSON.stringify(runs)}`, () => {
      expect(par(ser(runs, TOKENS), TOKENS)).toEqual(runs);
    });
  }

  test("a mark straddling whitespace canonicalizes, then is stable", () => {
    // Boundary whitespace is hoisted OUT of the delimiters (a delimiter may
    // never flank a space), which is invisible when rendered.
    const runs: RichText = [{ text: "a ", marks: ["bold"] }, { text: "b" }];
    const once = ser(runs, TOKENS);
    expect(once).toBe("**a** b");
    const back = par(once, TOKENS);
    expect(back).toEqual([{ text: "a", marks: ["bold"] }, { text: " b" }]);
    expect(ser(back, TOKENS)).toBe(once);
    expect(par(ser(back, TOKENS), TOKENS)).toEqual(back);
  });

  test("a mark straddling a protected span canonicalizes in ONE cycle", () => {
    const runs: RichText = [{ text: "a \\(x*y\\) b", marks: ["bold"] }];
    const once = ser(runs, TOKENS);
    expect(once).toBe("**a** \\(x*y\\) **b**");
    const back = par(once, TOKENS);
    expect(ser(back, TOKENS)).toBe(once);
    expect(par(ser(back, TOKENS), TOKENS)).toEqual(back);
  });

  test("an all-whitespace marked run loses the marks it cannot express", () => {
    expect(ser([{ text: "   ", marks: ["bold"] }])).toBe("   ");
  });
});
