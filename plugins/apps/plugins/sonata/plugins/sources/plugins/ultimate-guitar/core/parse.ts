/**
 * Pure parser: Ultimate Guitar raw tab markup → a structured song model.
 *
 * UG carries a song as a single flat string of lightly-marked-up text. Three
 * things matter:
 *
 *   - **chord tokens** `[ch]Cmaj7[/ch]` — a chord, positioned over a lyric;
 *   - **section headers** `[Verse]`, `[Chorus]`, `[Verse 1]`, `[Bridge]`, … —
 *     a bracketed label alone on its own line;
 *   - **tab-block markers** `[tab]…[/tab]` — whitespace-preservation hints UG
 *     wraps monospaced chord+lyric blocks in; they carry no musical meaning.
 *
 * UG lays chords out in one of two ways, and a single scanner handles both:
 *
 *   1. **Chords above lyrics** (the common case) — a line of `[ch]` tokens
 *      separated by spaces, with the lyric on the *next* line. The whitespace
 *      positions each chord over the syllable it sounds on.
 *   2. **Inline chords** — `[ch]C[/ch]I once [ch]G[/ch]was lost`, chords woven
 *      directly into a single lyric line.
 *
 * The trick that unifies them: markup tokens are **zero-width**. As the scanner
 * walks a line it advances a *visible column* for every residual (non-markup)
 * character and skips the markup, so a chord's `charOffset` is the visible
 * column where it sits — which is exactly the column it aligns to in the lyric
 * (the next line in case 1, the residual text in case 2). `[tab]`/`[/tab]` are
 * zero-width too, so they never shift a column — stripping them textually would.
 *
 * Output shape: ordered {@link ParsedSection}s, each an ordered list of
 * {@link ParsedLine}s carrying their chords (`symbol` + `charOffset`) and lyric
 * text. `key`/`capo` come from the UG metadata fields, not the markup.
 *
 * ## Fail loud
 *
 * Malformed markup is **never** silently dropped — it throws a classified
 * {@link UgParseError}: an unbalanced/nested `[ch]`, a stray `[/ch]`, an empty
 * `[ch][/ch]`, or unbalanced `[tab]` blocks. A loud failure surfaces UG format
 * drift as a controlled error (toast / crash task) the same way the fetch layer
 * does, rather than producing a quietly-corrupt song.
 *
 * Chord-*symbol* validity is deliberately NOT checked here — `symbol` is carried
 * verbatim. Parsing a symbol into a `ChordData` (via `theory.parseChordSymbol`)
 * is the compile step's job; keeping it out preserves this core leaf's purity
 * (it depends on nothing but `zod`).
 */

import type { UgTab } from "./raw-tab";

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

/** A distinct, actionable way UG markup can be malformed. */
export type UgParseErrorKind =
  | "unbalanced-chord"
  | "empty-chord"
  | "unbalanced-tab";

/** A controlled, classified failure of the UG markup parser. */
export class UgParseError extends Error {
  readonly kind: UgParseErrorKind;

  constructor(
    kind: UgParseErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "UgParseError";
    this.kind = kind;
  }
}

// ---------------------------------------------------------------------------
// Structured model
// ---------------------------------------------------------------------------

/** A chord placed over a lyric line by visible character column. */
export interface ParsedChord {
  /**
   * The chord symbol exactly as written in UG (e.g. `"Cmaj7"`, `"F#m"`,
   * `"G/B"`). Carried verbatim — not validated as a real chord here.
   */
  symbol: string;
  /**
   * 0-based visible column, over the line's `lyric`, where the chord sounds.
   * May exceed `lyric.length` for a chord that hangs past the end of the line.
   */
  charOffset: number;
}

/** One rendered line: chords positioned over an (optional) lyric. */
export interface ParsedLine {
  /** Chords sounding on this line, in left-to-right column order. */
  chords: ParsedChord[];
  /** The lyric text. `""` for a chord-only line (e.g. an intro riff). */
  lyric: string;
}

/** A named block of the song (Verse, Chorus, …) with its ordered lines. */
export interface ParsedSection {
  /**
   * The section label as written (`"Verse 1"`, `"Chorus"`). `""` for the
   * implicit leading block holding any content before the first header.
   */
  name: string;
  lines: ParsedLine[];
}

/** The full structured tab: ordered sections plus song-level metadata. */
export interface ParsedTab {
  sections: ParsedSection[];
  /** Song key / tonality, or `null` when UG has none set. */
  key: string | null;
  /** Capo fret (0 = none). */
  capo: number;
}

// ---------------------------------------------------------------------------
// Line scanning
// ---------------------------------------------------------------------------

const CH_OPEN = "[ch]";
const CH_CLOSE = "[/ch]";
const TAB_OPEN = "[tab]";
const TAB_CLOSE = "[/tab]";

/** The residual (markup-stripped) text of a line plus the chords over it. */
interface ScannedLine {
  chords: ParsedChord[];
  /** Visible text with all markup removed; columns preserved for alignment. */
  text: string;
}

/**
 * Walk one line, pulling out `[ch]…[/ch]` chords and dropping `[tab]`/`[/tab]`
 * markers, while tracking the *visible column* so each chord's `charOffset` is
 * the column it occupies in the residual text. Markup is zero-width.
 *
 * Throws {@link UgParseError} on malformed chord markup (stray/nested/unclosed
 * `[ch]`, empty `[ch][/ch]`).
 */
function scanLine(line: string): ScannedLine {
  const chords: ParsedChord[] = [];
  let text = "";
  let i = 0;
  const n = line.length;

  while (i < n) {
    if (line.startsWith(TAB_OPEN, i)) {
      i += TAB_OPEN.length;
      continue;
    }
    if (line.startsWith(TAB_CLOSE, i)) {
      i += TAB_CLOSE.length;
      continue;
    }
    if (line.startsWith(CH_CLOSE, i)) {
      throw new UgParseError(
        "unbalanced-chord",
        `Stray [/ch] with no matching [ch]: ${JSON.stringify(line)}`,
      );
    }
    if (line.startsWith(CH_OPEN, i)) {
      // The chord sounds at the current visible column.
      const charOffset = text.length;
      i += CH_OPEN.length;
      let symbol = "";
      let closed = false;
      while (i < n) {
        if (line.startsWith(CH_CLOSE, i)) {
          i += CH_CLOSE.length;
          closed = true;
          break;
        }
        if (line.startsWith(CH_OPEN, i)) {
          throw new UgParseError(
            "unbalanced-chord",
            `Nested [ch] (missing a [/ch]): ${JSON.stringify(line)}`,
          );
        }
        symbol += line[i];
        i++;
      }
      if (!closed) {
        throw new UgParseError(
          "unbalanced-chord",
          `Unterminated [ch] (missing [/ch]): ${JSON.stringify(line)}`,
        );
      }
      const trimmed = symbol.trim();
      if (trimmed.length === 0) {
        throw new UgParseError(
          "empty-chord",
          `Empty chord token [ch][/ch]: ${JSON.stringify(line)}`,
        );
      }
      chords.push({ symbol: trimmed, charOffset });
      continue;
    }

    text += line[i];
    i++;
  }

  return { chords, text };
}

/** Count non-overlapping occurrences of `token` in `text`. */
function occurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

/**
 * If `line` is a section header — a single bracketed label alone on its line,
 * e.g. `[Chorus]`, `[Verse 1]` — return the label; otherwise `null`. `[tab]`
 * wrappers are tolerated; chord lines (`[ch]…`) are explicitly not headers.
 */
function sectionLabel(line: string): string | null {
  const stripped = line.split(TAB_OPEN).join("").split(TAB_CLOSE).join("").trim();
  if (stripped.includes(CH_OPEN) || stripped.includes(CH_CLOSE)) return null;
  // The whole line must be exactly one `[…]` token with no nested brackets.
  const m = stripped.match(/^\[([^[\]]+)\]$/);
  if (!m) return null;
  const label = m[1]!.trim();
  return label.length > 0 ? label : null;
}

/** Trim only trailing whitespace — leading columns are load-bearing. */
function trimEnd(s: string): string {
  return s.replace(/\s+$/, "");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse UG raw `content` markup into ordered sections of chord-over-lyric lines.
 *
 * Lines that appear before the first `[Section]` header land in an implicit
 * leading section with an empty `name`. Blank lines are dropped (sections, not
 * blank lines, carry structure) but still break chord↔lyric pairing.
 *
 * Throws {@link UgParseError} on malformed markup (see module docs).
 */
export function parseUgContent(content: string): ParsedSection[] {
  // `[tab]` blocks span lines, so the per-line scanner can't see imbalance —
  // validate balance globally up front. (`[tab]` is never a substring of
  // `[/tab]` or vice versa, so the two counts don't interfere.)
  const tabOpen = occurrences(content, TAB_OPEN);
  const tabClose = occurrences(content, TAB_CLOSE);
  if (tabOpen !== tabClose) {
    throw new UgParseError(
      "unbalanced-tab",
      `Unbalanced [tab] blocks: ${tabOpen} [tab] vs ${tabClose} [/tab].`,
    );
  }

  const lines = content.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  // The implicit leading section is created lazily — only if content actually
  // appears before the first header.
  const target = (): ParsedSection => {
    if (!current) {
      current = { name: "", lines: [] };
      sections.push(current);
    }
    return current;
  };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!;

    const header = sectionLabel(raw);
    if (header !== null) {
      current = { name: header, lines: [] };
      sections.push(current);
      continue;
    }

    const { chords, text } = scanLine(raw);
    const hasLyric = text.trim().length > 0;

    if (chords.length === 0) {
      if (!hasLyric) continue; // blank / whitespace-only line
      target().lines.push({ chords: [], lyric: trimEnd(text) });
      continue;
    }

    if (hasLyric) {
      // Inline chords woven into a lyric line — self-contained.
      target().lines.push({ chords, lyric: trimEnd(text) });
      continue;
    }

    // Floating chord line: pair with the immediately-following plain lyric line.
    const next = li + 1 < lines.length ? lines[li + 1]! : null;
    if (next !== null && sectionLabel(next) === null) {
      const below = scanLine(next);
      if (below.chords.length === 0 && below.text.trim().length > 0) {
        target().lines.push({ chords, lyric: trimEnd(below.text) });
        li++; // consume the paired lyric line
        continue;
      }
    }

    // Nothing to pair with → a chord-only line (intro riff, instrumental).
    target().lines.push({ chords, lyric: "" });
  }

  return sections;
}

/**
 * Parse a fetched {@link UgTab} into the full structured model: its `content`
 * markup into ordered sections, with `key`/`capo` carried through from the UG
 * metadata fields. This is the entry point the compile step consumes.
 */
export function parseUgTab(tab: UgTab): ParsedTab {
  return {
    sections: parseUgContent(tab.content),
    key: tab.key,
    capo: tab.capo,
  };
}
