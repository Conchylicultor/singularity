/**
 * Where `edit_page`'s `old_string` lands in the markdown it read, and what
 * replaces it there.
 *
 * A read scoped to a block holds what is nested under it, starting at depth
 * zero, so a bullet inside a `<todo>` card reads `    * text` in a whole-page
 * read and `  * text` in a read of the card.
 * An agent that copies a line from one read and edits through the other would
 * otherwise get "not found" for text that is plainly there. So when there is no
 * exact match, the snippet is tried again SHIFTED: every line moved left or
 * right by the same leading whitespace, and `new_string` moved with it. What
 * stays strict is the indentation BETWEEN its lines, because that decides which
 * bullet a line nests under.
 */

/** One replacement in the markdown: `[start, end)` becomes `replacement`. */
export interface IndentEdit {
  start: number;
  end: number;
  replacement: string;
  /**
   * The leading whitespace the caller's snippet carried (`from`) and the one
   * it matched at (`to`) — `null` for an exact match.
   */
  shift: { from: string; to: string } | null;
}

export type FindEditsResult =
  /** At least one match; every match, in document order, non-overlapping. */
  | { kind: "edits"; edits: [IndentEdit, ...IndentEdit[]] }
  | { kind: "none" }
  /**
   * The text matched only after a shift, but a line of `new_string` is less
   * indented than the snippet it replaces, so there is no single depth to move
   * it to.
   */
  | { kind: "new-string-shallower"; line: string };

const WHITESPACE_ONLY = /^[ \t]*$/;

function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)![0];
}

function isBlank(line: string): boolean {
  return WHITESPACE_ONLY.test(line);
}

/** Exact first; the shifted retry only when there is no exact match. */
export function findEdits(
  markdown: string,
  oldString: string,
  newString: string,
): FindEditsResult {
  const exact = exactEdits(markdown, oldString, newString);
  if (exact.length > 0)
    return { kind: "edits", edits: exact as [IndentEdit, ...IndentEdit[]] };
  return shiftedEdits(markdown, oldString, newString);
}

/** Non-overlapping occurrences of `oldString`, each replaced verbatim. */
function exactEdits(
  markdown: string,
  oldString: string,
  newString: string,
): IndentEdit[] {
  const edits: IndentEdit[] = [];
  let from = 0;
  for (;;) {
    const at = markdown.indexOf(oldString, from);
    if (at < 0) return edits;
    edits.push({
      start: at,
      end: at + oldString.length,
      replacement: newString,
      shift: null,
    });
    from = at + oldString.length;
  }
}

function shiftedEdits(
  markdown: string,
  oldString: string,
  newString: string,
): FindEditsResult {
  const oldLines = oldString.split("\n");
  // A snippet that opens with a line break starts at the END of some line, which
  // a line-anchored match cannot express. Rare enough to leave exact-only.
  if (isBlank(oldLines[0]!)) return { kind: "none" };
  const from = commonIndent(oldLines);
  if (from === undefined) return { kind: "none" };
  const pattern = oldLines.map((line) =>
    isBlank(line) ? "" : line.slice(from.length),
  );

  const lines = markdown.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  const matches: { start: number; end: number; to: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const match = matchAt(lines, i, pattern);
    if (match === undefined) {
      i += 1;
      continue;
    }
    const lastLine = i + pattern.length - 1;
    const last = pattern.at(-1)!;
    matches.push({
      start: lineStarts[i]!,
      // A blank last line is the position just after the snippet's final line
      // break (a snippet ending in "\n"), so the match ends at that line's start.
      end:
        last === ""
          ? lineStarts[lastLine]!
          : lineStarts[lastLine]! + match.length + last.length,
      to: match,
    });
    // Line-anchored, so the next match starts on a later line; a blank last
    // line consumed nothing of its own line, so that line is still available.
    i = last === "" ? lastLine : lastLine + 1;
  }
  const first = matches[0];
  if (first === undefined) return { kind: "none" };

  const edits: IndentEdit[] = [];
  for (const m of matches) {
    const replacement = reindent(newString, from, m.to);
    if (replacement.kind === "shallower") {
      return { kind: "new-string-shallower", line: replacement.line };
    }
    edits.push({
      start: m.start,
      end: m.end,
      replacement: replacement.text,
      shift: { from, to: m.to },
    });
  }
  return { kind: "edits", edits: edits as [IndentEdit, ...IndentEdit[]] };
}

/**
 * The leading whitespace every non-blank line starts with — the shortest one,
 * provided every other non-blank line starts with that exact string (a mix of
 * tabs and spaces has no common prefix to shift by, so it gets `undefined`).
 */
function commonIndent(lines: string[]): string | undefined {
  const indents = lines.filter((l) => !isBlank(l)).map(leadingWhitespace);
  let shortest = indents[0]!;
  for (const indent of indents) {
    if (indent.length < shortest.length) shortest = indent;
  }
  return indents.every((indent) => indent.startsWith(shortest))
    ? shortest
    : undefined;
}

/**
 * Does `pattern` (the snippet with its common indent removed) match starting at
 * line `i`, every line shifted by one whitespace prefix? Returns that prefix.
 *
 * Every line but the last must match whole; the last must only START the target
 * line, so a snippet may end mid-line. A blank pattern line matches any
 * whitespace-only line.
 */
function matchAt(
  lines: string[],
  i: number,
  pattern: string[],
): string | undefined {
  if (i + pattern.length > lines.length) return undefined;
  const head = lines[i]!;
  const lead = leadingWhitespace(head);
  const patternLead = leadingWhitespace(pattern[0]!);
  if (!lead.endsWith(patternLead)) return undefined;
  const to = lead.slice(0, lead.length - patternLead.length);
  for (let j = 0; j < pattern.length; j++) {
    const line = lines[i + j]!;
    const want = pattern[j]!;
    const isLast = j === pattern.length - 1;
    if (want === "") {
      if (!isLast && !isBlank(line)) return undefined;
      continue;
    }
    const expected = to + want;
    if (isLast ? !line.startsWith(expected) : line !== expected) {
      return undefined;
    }
  }
  return to;
}

/** `newString` with every non-blank line's leading `from` swapped for `to`. */
function reindent(
  newString: string,
  from: string,
  to: string,
): { kind: "ok"; text: string } | { kind: "shallower"; line: string } {
  const out: string[] = [];
  for (const line of newString.split("\n")) {
    if (isBlank(line)) {
      out.push("");
      continue;
    }
    if (!line.startsWith(from)) return { kind: "shallower", line };
    out.push(to + line.slice(from.length));
  }
  return { kind: "ok", text: out.join("\n") };
}
