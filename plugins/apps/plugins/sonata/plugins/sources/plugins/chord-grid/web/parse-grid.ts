/**
 * Chord-grid mini-language parser: grid text → timed chord events.
 *
 * The grammar is deliberately small — three things:
 *
 *   - a **chord** (`Cmaj7`, `F#m`, `Bb13`, `G7(♯5)`) occupies one bar. A chord
 *     may carry parenthetical alterations *attached* to it (no space) — these
 *     are absorbed into the token, so they are never mistaken for a group. A
 *     chord may equally be written as a **Roman numeral** (`I`, `vi`, `V7`,
 *     `iiø7`, `♭VII`), resolved against the key in force — a *degree*, not a
 *     letter, so a progression can be written once and heard in any key;
 *   - a **group** `( … )` — a `(` at a cell boundary — puts several items in a
 *     single bar, splitting it equally between them;
 *   - a **hold** `.` extends the previous chord instead of striking a new one.
 *
 * Plus two pieces of trivia that consume no bar:
 *
 *   - a `;` starts a comment that runs to the end of the line (`; verse`);
 *     comments are stripped before tokenizing. `;` is deliberately NOT a musical
 *     character, so it needs no positional rule to disambiguate — unlike `#`,
 *     which it replaced: `#` is the sharp, and a degree may legally *begin* with
 *     one (`♯IV`), so no position was ever safely free for it;
 *   - a `key: Am` **directive** sets the key that Roman numerals resolve
 *     against, from that point forward (so a grid may modulate). Absent any
 *     directive the key is C major, and letter-name chords never consult it.
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

import type { KeySignature } from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  parseChordSymbol,
  parseKeySignature,
  parseRomanNumeral,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { type ChordEvent } from "@plugins/apps/plugins/sonata/plugins/voicing/core";

/** Default bar length in quarter-note beats (4/4). */
const BEATS_PER_BAR = 4;

/** The hold marker: extends the previous chord rather than striking a new one. */
const HOLD = ".";

/** The comment marker. Not a musical character, so it means this and nothing else. */
const COMMENT = ";";

/**
 * The key Roman numerals resolve against until a `key:` directive says otherwise.
 * C major is the neutral choice: its degrees are the plain white keys, so an
 * undeclared `I vi IV V` reads C Am F G — and the transpose control moves it.
 */
export const DEFAULT_KEY: KeySignature = { tonic: "C", mode: "major" };

/**
 * A `key:` / `key=` directive opening a cell, with the tonic attached (`key:Am`)
 * or left for the next cell (`key: Am`). `key` is not a chord symbol, so nothing
 * legal is shadowed.
 */
const KEY_DIRECTIVE = /^key[:=](.*)$/i;

/** A key change established at a beat — the grid's authored key context. */
export interface KeyChange {
  beat: number;
  key: KeySignature;
}

/** A tokenized cell: a chord, a parenthesised group, a hold, or a key directive. */
type Cell =
  | { kind: "chord"; token: string }
  | { kind: "group"; items: string[] }
  | { kind: "hold" }
  | { kind: "key"; arg: string };

/**
 * The insignificant characters: whitespace and the optional `|` bar separator.
 * They separate cells and carry no meaning of their own — unlike `(`, `)` and
 * `.`, which are part of the grammar.
 */
function isInsignificant(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "|";
}

/**
 * Strip line comments — lexical trivia, removed before tokenizing so `(` groups,
 * chord runs and holds never have to know about them. The terminating newline
 * survives, so a comment can't glue two lines into one cell.
 *
 * `;` carries no musical meaning, so a comment starts wherever one appears —
 * there is nothing to disambiguate against, and no position clause to remember.
 */
function stripComments(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    if (c === COMMENT) {
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

/**
 * Read one bare run starting at `start` — a chord token or a directive — up to
 * the next boundary, absorbing any parentheses ATTACHED to it (no preceding
 * space): a parenthetical alteration like `G7(♯5)` or `Gsus4(♭9)`. A grouping
 * `( … )` only ever opens at a cell boundary (handled by the caller), so a `(`
 * reached mid-run belongs to the chord, not a group.
 */
function readRun(text: string, start: number): { token: string; next: number } {
  const n = text.length;
  let i = start;
  let token = "";
  while (i < n) {
    const ch = text[i]!;
    if (ch === "(") {
      // Absorb a balanced (…) alteration group, parens included.
      let depth = 0;
      while (i < n) {
        const d = text[i]!;
        token += d;
        i++;
        if (d === "(") depth++;
        else if (d === ")") {
          depth--;
          if (depth === 0) break;
        }
      }
    } else if (isBoundary(ch)) {
      break;
    } else {
      token += ch;
      i++;
    }
  }
  return { token, next: i };
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

    const run = readRun(text, i);
    i = run.next;

    // A `key:` / `key=` directive. The tonic may be attached (`key:Am`) or sit
    // in the next cell (`key: Am`) — the friendlier spelling, so we look ahead
    // past the insignificant characters for it. A directive with no tonic at all
    // falls through with an empty arg and is reported as a typo by `expand`.
    const directive = KEY_DIRECTIVE.exec(run.token);
    if (directive) {
      let arg = directive[1]!;
      if (arg === "") {
        let j = i;
        while (j < n && isInsignificant(text[j]!)) j++;
        if (j < n && !isBoundary(text[j]!)) {
          const tonic = readRun(text, j);
          arg = tonic.token;
          i = tonic.next;
        }
      }
      cells.push({ kind: "key", arg });
      continue;
    }

    cells.push({ kind: "chord", token: run.token });
  }

  return { cells, skipped };
}

/** Expand cells into timed chord events, one bar per top-level cell. */
function expand(cells: Cell[]): {
  events: ChordEvent[];
  skipped: string[];
  keys: KeyChange[];
} {
  const events: ChordEvent[] = [];
  const skipped: string[] = [];
  const keys: KeyChange[] = [];
  let beat = 0;
  // The event a hold extends — null at the start or after a silent slot.
  let lastEvent: ChordEvent | null = null;
  // The key Roman numerals resolve against; a `key:` directive moves it.
  let key = DEFAULT_KEY;

  // Strike a chord token over `[start, start+len)`, recording typos as skipped.
  // A token is a letter-name chord (`Am7`) or a Roman numeral (`vi7`) — tried in
  // that order, since no numeral begins with a note letter, so a chord symbol
  // can never be shadowed by a degree. Returns the new event (or null) so the
  // caller updates `lastEvent` in the linear flow — assigning it only inside
  // this closure would defeat narrowing.
  const strike = (
    token: string,
    start: number,
    len: number,
  ): ChordEvent | null => {
    const data = parseChordSymbol(token) ?? parseRomanNumeral(token, key);
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
    } else if (cell.kind === "key") {
      // Trivia, like a comment: a key directive establishes context, not a bar.
      const parsed = parseKeySignature(cell.arg);
      if (!parsed) {
        skipped.push(`key:${cell.arg}`);
        continue;
      }
      key = parsed;
      // Two directives on the same beat: the last one wins, as it does downstream.
      if (keys.at(-1)?.beat === beat) keys[keys.length - 1] = { beat, key };
      else keys.push({ beat, key });
      continue;
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

  return { events, skipped, keys };
}

/**
 * Parse the grid text into timed chord events plus the key changes its `key:`
 * directives establish; unparseable tokens are skipped.
 */
export function parseGrid(text: string): {
  events: ChordEvent[];
  skipped: string[];
  keys: KeyChange[];
} {
  const { cells, skipped: tokSkipped } = tokenize(stripComments(text));
  const { events, skipped: expSkipped, keys } = expand(cells);
  return { events, skipped: [...tokSkipped, ...expSkipped], keys };
}
