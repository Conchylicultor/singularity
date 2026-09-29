// The GFM pipe-table LINE syntax, as pure string functions: splitting a row
// into cells, the table-level escapes, and the delimiter row.
//
// Two escape layers stay disjoint here, and that is the whole design:
//
//  - the INLINE layer (`serializeInlineMarkdown` / `parseInlineMarkdown`, reached
//    through `ctx.mdLine` / `ctx.runs`) spells marks, links and nine literal
//    characters, and knows nothing about `|`;
//  - the TABLE layer (this file) spells the two things only a table cares
//    about — a literal `|` inside a cell (`\|`), and a cell that would read as a
//    delimiter cell (`\---`) — over the inline layer's OUTPUT, and undoes them
//    before handing a cell back to it.
//
// Every scan here walks the same three kinds of unit, left to right, so the
// escape, the unescape and the split can never disagree about which `|` is a
// separator:
//
//  - a PROTECTED SPAN (`\(a|b\)`, `[[page:…]]`), matched at the current
//    position and taken verbatim — its bytes are the inline layer's to keep;
//  - a BACKSLASH PAIR (`\X`, for any X), taken as one unit — so `\\|` is a
//    literal backslash then a separator, and `\|` is an escaped pipe. The inline
//    layer only ever emits a backslash as the first half of a pair, so the pair
//    never straddles anything it produced;
//  - any other single character.
//
// A span is matched ANCHORED at the scan position rather than by a global
// search over the row, because a global search can match a span ACROSS a cell
// boundary (`| \\(a | b\\) |` holds a `\(`…`\)` pair made of two escaped
// backslashes in two different cells).

/** One column's alignment, as a GFM delimiter cell states it. `null` = none. */
export type Align = "left" | "center" | "right" | null;

type Unit = { kind: "span" | "pair" | "char"; text: string };

function unitsOf(text: string, protectedSpans: readonly RegExp[]): Unit[] {
  const sticky = protectedSpans.map((p) => new RegExp(p.source, "y"));
  const out: Unit[] = [];
  let i = 0;
  outer: while (i < text.length) {
    for (const re of sticky) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m !== null && m[0].length > 0) {
        out.push({ kind: "span", text: m[0] });
        i += m[0].length;
        continue outer;
      }
    }
    if (text[i] === "\\" && i + 1 < text.length) {
      out.push({ kind: "pair", text: text.slice(i, i + 2) });
      i += 2;
      continue;
    }
    out.push({ kind: "char", text: text[i]! });
    i += 1;
  }
  return out;
}

/** A cell whose trimmed text a GFM parser would read as a delimiter cell. */
const DELIMITER_CELL = /^:?-+:?$/;
/** That same cell, escaped by one leading backslash (see {@link escapeCell}). */
const ESCAPED_DELIMITER_CELL = /^\\:?-+:?$/;

/**
 * Split one table row (starting with `|`) into its RAW cells: still escaped,
 * untrimmed. The leading pipe opens the row; a trailing pipe closes it (and is
 * optional, as in GFM); every other unescaped `|` outside a protected span
 * separates two cells. A row always has at least one cell.
 */
export function splitRow(
  line: string,
  protectedSpans: readonly RegExp[],
): string[] {
  const units = unitsOf(line, protectedSpans);
  const opens = units[0]?.kind === "char" && units[0].text === "|";
  const cells: string[] = [];
  let cur = "";
  for (const unit of opens ? units.slice(1) : units) {
    if (unit.kind === "char" && unit.text === "|") {
      cells.push(cur);
      cur = "";
    } else cur += unit.text;
  }
  // What follows the last separator is a cell only when it holds something:
  // `| a | b |` ends in an empty tail, which is the closing pipe, not a cell.
  if (cells.length === 0 || cur.trim() !== "") cells.push(cur);
  return cells;
}

/**
 * A raw cell's markdown with the TABLE layer undone: trimmed, the delimiter-cell
 * escape stripped, every `\|` outside a protected span back to `|`. What comes
 * back is the inline layer's own spelling, for `ctx.runs`.
 */
export function unescapeCell(
  raw: string,
  protectedSpans: readonly RegExp[],
): string {
  const cell = raw.trim();
  if (ESCAPED_DELIMITER_CELL.test(cell)) return cell.slice(1);
  return unitsOf(cell, protectedSpans)
    .map((u) => (u.kind === "pair" && u.text === "\\|" ? "|" : u.text))
    .join("");
}

/**
 * The inverse of {@link unescapeCell}: a cell's inline markdown made safe to
 * sit between two pipes. Every `|` outside a protected span becomes `\|`, and a
 * cell that would read as a delimiter cell (`---`, `:-:`) gets one leading
 * backslash — otherwise a body row made only of such cells is a delimiter row,
 * and the row above it would come back as the header of a new table.
 */
export function escapeCell(
  md: string,
  protectedSpans: readonly RegExp[],
): string {
  const escaped = unitsOf(md, protectedSpans)
    .map((u) => (u.kind === "char" && u.text === "|" ? "\\|" : u.text))
    .join("");
  return DELIMITER_CELL.test(escaped) ? "\\" + escaped : escaped;
}

/**
 * The alignments a delimiter row states, one per cell, or `null` when the line
 * is not a delimiter row (some cell is not `:?-+:?`).
 */
export function parseDelimiterRow(
  line: string,
  protectedSpans: readonly RegExp[],
): Align[] | null {
  const aligns: Align[] = [];
  for (const raw of splitRow(line, protectedSpans)) {
    const cell = raw.trim();
    if (!DELIMITER_CELL.test(cell)) return null;
    const left = cell.startsWith(":");
    const right = cell.length > 1 && cell.endsWith(":");
    aligns.push(
      left && right ? "center" : left ? "left" : right ? "right" : null,
    );
  }
  return aligns;
}

/** The delimiter cell for one column's alignment. */
export function delimiterCell(align: Align): string {
  switch (align) {
    case "left":
      return ":--";
    case "right":
      return "--:";
    case "center":
      return ":-:";
    case null:
      return "---";
  }
}

/** Cells (already escaped) joined into one row: `| a | b |`. */
export function formatRow(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/** `cells` padded with empty cells or truncated to exactly `width` (GFM). */
export function fitRow(cells: readonly string[], width: number): string[] {
  return Array.from({ length: width }, (_, i) => cells[i] ?? "");
}
