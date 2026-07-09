/**
 * Chord-grid mini-language parser: grid text → timed chord events.
 *
 * The grammar is deliberately small — three things:
 *
 *   - a **chord** (`Cmaj7`, `F#m`, `Bb13`, `G7(♯5)`) occupies one bar. A chord
 *     may carry parenthetical alterations *attached* to it (no space) — these
 *     are absorbed into the token, so they are never mistaken for a group;
 *   - a **group** `( … )` — a `(` at a cell boundary — puts several items in a
 *     single bar, splitting it equally between them;
 *   - a **hold** `.` extends the previous chord instead of striking a new one.
 *
 * A `#` **opening a cell** starts a comment that runs to the end of the line
 * (`# verse`); comments are lexical trivia, stripped before tokenizing.
 *
 * Cells are separated by whitespace / newlines (newlines are purely cosmetic),
 * and a stray `|` is accepted and ignored so old `| C G | Am F |` grids keep
 * parsing. Each top-level cell is one bar (`BEATS_PER_BAR` quarter-note beats).
 *
 * `.` holds work the same way at both levels: inside a group it eats one
 * sub-slot of that bar (`(C . . D)` → C for 3 beats + D for 1), and at the top
 * level it eats a whole bar (`Cmaj7 . .` → one Cmaj7 sustained across 3 bars).
 * A hold extends whatever chord last sounded, even across a bar boundary; a hold
 * with nothing before it (grid start, or after an unparseable token) is silence.
 *
 * Unparseable tokens never crash — they are collected into `skipped` and
 * surfaced by the loader, so typos stay visible rather than silently dropped.
 */

import { parseChordSymbol } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { type ChordEvent } from "@plugins/apps/plugins/sonata/plugins/voicing/core";

/** Default bar length in quarter-note beats (4/4). */
const BEATS_PER_BAR = 4;

/** The hold marker: extends the previous chord rather than striking a new one. */
const HOLD = ".";

/** The comment marker — only when it opens a cell; inside a token it is a sharp. */
const COMMENT = "#";

/** A tokenized cell: a single chord, a parenthesised group, or a hold. */
type Cell =
  | { kind: "chord"; token: string }
  | { kind: "group"; items: string[] }
  | { kind: "hold" };

/**
 * The insignificant characters: whitespace and the optional `|` bar separator.
 * They separate cells and carry no meaning of their own — unlike `(`, `)` and
 * `.`, which are part of the grammar.
 */
function isInsignificant(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "|";
}

/**
 * Does the `#` at `i` open a comment, or is it a sharp inside a token?
 *
 * `#` does double duty, disambiguated by what precedes it — the same trick the
 * grammar already plays with `(` (group vs. attached alteration). A `#` opening
 * a cell (start of text, or after an insignificant character) is a comment; a
 * `#` reached anywhere else belongs to the token being written, so `F#m`,
 * `G7(#5)` and `(C#m E)` are untouched. No chord symbol may *begin* with `#`, so
 * nothing legal is shadowed.
 */
function opensComment(text: string, i: number): boolean {
  return i === 0 || isInsignificant(text[i - 1]!);
}

/**
 * Strip line comments — lexical trivia, removed before tokenizing so `(` groups,
 * chord runs and holds never have to know about them. The terminating newline
 * survives, so a comment can't glue two lines into one cell.
 */
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    if (c === COMMENT && opensComment(text, i)) {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Characters that end a bare chord run (whitespace, group/bar/hold markers). */
function isBoundary(c: string): boolean {
  return isInsignificant(c) || c === "(" || c === ")" || c === HOLD;
}

/** Char-scan the grid text into cells (groups contain spaces, so no naive split). */
function tokenize(text: string): { cells: Cell[]; skipped: string[] } {
  const cells: Cell[] = [];
  const skipped: string[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i]!;

    // Whitespace and the optional `|` bar separator are insignificant.
    if (isInsignificant(c)) {
      i++;
      continue;
    }

    if (c === ")") {
      skipped.push(")"); // stray closer with no open group
      i++;
      continue;
    }

    if (c === "(") {
      // A `(` at a cell boundary opens a bar group. Read to its matching close
      // at depth 0 — depth-aware so a chord's own alteration parens inside the
      // group (e.g. `(G7(♯5) A)`) don't end the group early.
      const start = i;
      i++;
      let body = "";
      let closed = false;
      let depth = 1;
      while (i < n) {
        const d = text[i]!;
        if (d === "(") depth++;
        else if (d === ")") {
          depth--;
          if (depth === 0) {
            closed = true;
            i++;
            break;
          }
        }
        body += d;
        i++;
      }
      if (!closed) {
        skipped.push(text.slice(start)); // unterminated group
        break;
      }
      // Group items are whitespace-separated; a chord's own `(…)` has no inner
      // space, so `G7(♯5)` stays one item.
      const items = body.split(/\s+/).filter((t) => t.length > 0);
      cells.push({ kind: "group", items });
      continue;
    }

    if (c === HOLD) {
      cells.push({ kind: "hold" });
      i++;
      continue;
    }

    // Bare chord run, absorbing any parentheses ATTACHED to the run (no
    // preceding space) — a parenthetical alteration like `G7(♯5)` or
    // `Gsus4(♭9)`. A grouping `( … )` only ever opens at a cell boundary (handled
    // above), so a `(` reached mid-run belongs to the chord, not a group.
    let tok = "";
    let done = false;
    while (i < n && !done) {
      const ch = text[i]!;
      if (ch === "(") {
        // Absorb a balanced (…) alteration group, parens included.
        let depth = 0;
        while (i < n) {
          const d = text[i]!;
          tok += d;
          i++;
          if (d === "(") depth++;
          else if (d === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
      } else if (isBoundary(ch)) {
        done = true;
      } else {
        tok += ch;
        i++;
      }
    }
    cells.push({ kind: "chord", token: tok });
  }

  return { cells, skipped };
}

/** Expand cells into timed chord events, one bar per top-level cell. */
function expand(cells: Cell[]): { events: ChordEvent[]; skipped: string[] } {
  const events: ChordEvent[] = [];
  const skipped: string[] = [];
  let beat = 0;
  // The event a hold extends — null at the start or after a silent slot.
  let lastEvent: ChordEvent | null = null;

  // Strike a chord token over `[start, start+len)`, recording typos as skipped.
  // Returns the new event (or null) so the caller updates `lastEvent` in the
  // linear flow — assigning it only inside this closure would defeat narrowing.
  const strike = (
    token: string,
    start: number,
    len: number,
  ): ChordEvent | null => {
    const data = parseChordSymbol(token);
    if (!data) {
      skipped.push(token);
      return null;
    }
    const ev: ChordEvent = { data, start, end: start + len };
    events.push(ev);
    return ev;
  };

  for (const cell of cells) {
    if (cell.kind === "chord") {
      lastEvent = strike(cell.token, beat, BEATS_PER_BAR);
    } else if (cell.kind === "hold") {
      if (lastEvent) lastEvent.end += BEATS_PER_BAR;
    } else {
      // group: split this one bar equally among its items.
      const { items } = cell;
      if (items.length > 0) {
        const sub = BEATS_PER_BAR / items.length;
        let subBeat = beat;
        for (const item of items) {
          if (item === HOLD) {
            if (lastEvent) lastEvent.end += sub;
          } else {
            lastEvent = strike(item, subBeat, sub);
          }
          subBeat += sub;
        }
      }
    }
    beat += BEATS_PER_BAR;
  }

  return { events, skipped };
}

/** Parse the grid text into timed chord events; unparseable tokens are skipped. */
export function parseGrid(text: string): {
  events: ChordEvent[];
  skipped: string[];
} {
  const { cells, skipped: tokSkipped } = tokenize(stripComments(text));
  const { events, skipped: expSkipped } = expand(cells);
  return { events, skipped: [...tokSkipped, ...expSkipped] };
}
