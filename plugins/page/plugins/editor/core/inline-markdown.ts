/**
 * Inline markdown formatting shortcuts: the delimiter table, plus the pure
 * matcher that decides whether the character the user just typed CLOSED one.
 *
 * The table is plain data in `core/` rather than a slot because `Mark` is a
 * closed, persisted `z.enum` with a fixed `MARK_ORDER` (`rich-text.ts`) — a
 * sixth mark is a core edit plus a migration, never a contribution. Being data
 * in a leaf module is also what lets the *server* reuse it: `markdown.ts`'s
 * `MdSerializeCtx.plain` already declares the intent to render `**`/`_`/`` ` ``
 * on clipboard export, and a second copy of the delimiters there could drift
 * from the one the editor types against.
 *
 * This is a syntax layer ABOVE the persisted model, so it imports `Mark` /
 * `sortMarks` from `./rich-text` instead of being appended to it. Nothing here
 * touches Lexical or the DOM: the whole decision is a function of the line text
 * before the caret, which is what makes it `bun:test`-able with no editor
 * bootstrap (`inline-markdown.test.ts`).
 */

import { type Mark, sortMarks } from "./rich-text";

/** One delimiter row: `tag` wraps `marks`, symmetrically on both sides. */
export interface InlineSyntax {
  /** Delimiter, identical on both sides. */
  readonly tag: string;
  /** Applied together — `***` is bold AND italic, in one keystroke. */
  readonly marks: readonly Mark[];
  /**
   * `false` for the `_` family: CommonMark forbids intra-word `_` emphasis so
   * that `snake_case_name` and `x_1 y_2` stay literal. The `*` family has no
   * such restriction (`a*b*` genuinely emphasizes in CommonMark).
   */
  readonly intraword: boolean;
}

/**
 * Closed table, LONGEST TAG FIRST — the order `matchInlineFormat` tries rows
 * in, and therefore the precedence rule itself: `***x***` resolves as one
 * bold+italic row rather than `**` wrapping `*x*`.
 *
 * `"underline"` deliberately appears in NO row: markdown has no underline
 * syntax, so underline stays Cmd+U. Its absence is the proof that this table is
 * data — a mark can decline to declare a delimiter. `==highlight==` is absent
 * for the mirror-image reason: it has no corresponding `Mark`.
 */
export const INLINE_SYNTAXES: readonly InlineSyntax[] = [
  { tag: "***", marks: ["bold", "italic"], intraword: true },
  { tag: "___", marks: ["bold", "italic"], intraword: false },
  { tag: "**", marks: ["bold"], intraword: true },
  { tag: "__", marks: ["bold"], intraword: false },
  { tag: "~~", marks: ["strikethrough"], intraword: true },
  { tag: "`", marks: ["code"], intraword: true },
  { tag: "*", marks: ["italic"], intraword: true },
  { tag: "_", marks: ["italic"], intraword: false },
];

/**
 * Where the two delimiters sit and what to apply between them. Indices are
 * offsets into the LINE the caret is on (see `matchInlineFormat`'s clamp), so
 * the content span is `[openStart + tagLength, closeStart)`.
 */
export interface InlineFormatMatch {
  /** Index of the first char of the OPENING delimiter. */
  openStart: number;
  /** Index of the first char of the CLOSING delimiter. */
  closeStart: number;
  /** 1..3 — the matched row's `tag.length`. */
  tagLength: number;
  /** Canonically sorted via `sortMarks`, so it is storable as-is. */
  marks: Mark[];
}

/**
 * The two characters flanking the candidate, which the line text before the
 * caret cannot supply. Both are optional because "there is nothing there" (line
 * start / line end) is a legitimate, and permissive, answer.
 */
export interface InlineFormatContext {
  /** Char immediately before `textBefore` on the same line, or undefined at line start. */
  charBefore?: string;
  /** Char immediately after the caret on the same line, or undefined at line end. */
  charAfter?: string;
}

/**
 * The flanking-character class `@lexical/markdown` uses (ASCII punctuation plus
 * whitespace). Kept verbatim rather than re-derived: it is the CommonMark
 * "punctuation or space" flank test the `_`-family rules are specified against.
 */
const PUNCTUATION_OR_SPACE = /[!-/:-@[-`{-~\s]/;

const WHITESPACE = /\s/;

/**
 * The nearest-to-caret `tag` occurrence before `closeStart` that could open the
 * span, or `null` when the row has no opener.
 *
 * Scanning DOWNWARD (nearest first) is what makes `**a *b*` italicize just `b`
 * rather than reaching back past the bold delimiters. A candidate with
 * whitespace right after it is rejected — "a space after the opening delimiter
 * cancels it", so `** x**` does not bold — but that rejection must NOT abort the
 * row: an earlier position can still be a legal opener, so the scan continues.
 */
function findOpener(line: string, tag: string, closeStart: number): number | null {
  const d = tag.length;
  for (let start = closeStart - 1; start >= 0; start--) {
    if (!line.startsWith(tag, start)) continue;
    // `start <= closeStart - 1` ⇒ `start + d <= closeStart - 1 + d <= n - 1`, so
    // this read is always in range.
    if (WHITESPACE.test(line[start + d]!)) continue;
    return start;
  }
  return null;
}

/** How many `` ` `` chars precede `end` — odd means "inside an unclosed code span". */
function countBackticksBefore(line: string, end: number): number {
  let n = 0;
  for (let i = 0; i < end; i++) if (line[i] === "`") n += 1;
  return n;
}

/**
 * The inline format the just-typed character closed, or `null` when it closed
 * nothing.
 *
 * `textBefore` is the current line up to AND INCLUDING the just-typed character,
 * so the caret sits at `textBefore.length` and the typed char is the candidate
 * closer. `ctx` supplies the two chars this function cannot see (before the
 * fragment, after the caret).
 *
 * `null` is NOT an absorbed failure: "this keystroke closed nothing" is the
 * dominant legitimate outcome — it is the answer for nearly every keystroke the
 * user makes — exactly like `scanTrigger`/`findTrigger` in the caret-trigger
 * primitive. There is no failure mode to report; a malformed candidate and a
 * plain letter are the same non-event.
 */
export function matchInlineFormat(
  textBefore: string,
  ctx: InlineFormatContext = {},
): InlineFormatMatch | null {
  // Rule 0 — line clamp, DEFENSIVE. The real web caller never sees a "\n" here
  // (`runs-lexical.ts` materializes soft breaks as `LineBreakNode`s, so a
  // `TextNode`'s text never holds one), but a matcher that CAN span a line is a
  // latent corruption: the delimiters would sit in different visual lines and
  // the surgery would eat the break. Clamping to the last line makes it
  // structurally impossible; reported indices are in that clamped basis.
  const lastBreak = textBefore.lastIndexOf("\n");
  const line = lastBreak === -1 ? textBefore : textBefore.slice(lastBreak + 1);

  const n = line.length;
  if (n === 0) return null;
  const closeChar = line[n - 1]!;

  for (const row of INLINE_SYNTAXES) {
    const d = row.tag.length;
    const closeStart = n - d;

    // The line must END with this row's tag — the typed char closed it — with at
    // least one char before it (`>= 1`, not `>= 0`: something must precede the
    // closer for there to be an opener at all).
    if (closeStart < 1) continue;
    if (line.slice(closeStart) !== row.tag) continue;

    // `** x **` is not bold: whitespace immediately before the closer means the
    // user typed a literal, not a closing delimiter.
    if (WHITESPACE.test(line[closeStart - 1]!)) continue;

    // Right flank for the `_` family: `_x_y` must stay literal. Undefined
    // (caret at line end) is permissive.
    if (
      !row.intraword &&
      ctx.charAfter !== undefined &&
      !PUNCTUATION_OR_SPACE.test(ctx.charAfter)
    ) {
      continue;
    }

    const openStart = findOpener(line, row.tag, closeStart);
    if (openStart === null) continue;

    // Non-empty content, STRICT — and load-bearing twice over, not an obvious
    // guard. It is the single rule that makes `**` typable at all (an empty span
    // is what the user is halfway through typing), and it keeps the `` ` `` row
    // from claiming the third backtick of ` ``` ` — so the BLOCK-level
    // code-fence prefix stays reachable, with no coordination between the two
    // markdown layers.
    if (openStart + d >= closeStart) continue;

    // Repeating-char rule. While typing toward `**b**` the user passes through
    // `**b*`, whose `*` row would otherwise italicize `b` and eat the
    // delimiters mid-word. Rejecting when the char before the opener equals the
    // closing char makes that state inert, and is the same rule that stops `**`
    // from stealing `***`.
    if (openStart > 0 && line[openStart - 1] === closeChar) continue;

    // Left flank for the `_` family — the `snake_case_name` rule. At the start
    // of the fragment the answer comes from the caller's `charBefore`; undefined
    // (true line start) is permissive.
    if (!row.intraword) {
      const before = openStart > 0 ? line[openStart - 1] : ctx.charBefore;
      if (before !== undefined && !PUNCTUATION_OR_SPACE.test(before)) continue;
    }

    // Code-span precedence (CommonMark): an odd number of backticks before the
    // opener means we are INSIDE an unclosed code span, where nothing else
    // formats — so `` `a*b*c` `` stays literal until its own backtick closes it.
    // The code row itself is exempt: it is the thing doing the closing.
    if (!row.marks.includes("code") && countBackticksBefore(line, openStart) % 2 === 1) {
      continue;
    }

    return { openStart, closeStart, tagLength: d, marks: sortMarks(row.marks) };
  }

  return null;
}
