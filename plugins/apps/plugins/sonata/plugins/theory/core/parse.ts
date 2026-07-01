/**
 * Forward chord parsing: a chord symbol string → `ChordData`.
 *
 * This is the inverse of the chord-analyzer's `detectChord` (notes → chord).
 * Chord-authoring sources (e.g. the chord grid, Ultimate-Guitar tabs) parse
 * user-typed symbols like `"Cmaj7"`, `"F#m"`, `"Bbdim7"`, `"G7(♯5)"`,
 * `"Gsus4(♭9)"`, `"Eb6/9"` into `{ root, quality, symbol }`, then realise them
 * into notes via a voicing strategy.
 *
 * Rather than an exact-match table of every chord (which cannot scale to stacked
 * alterations), the parser is a small **grammar**:
 *
 *     root  →  optional /bass  →  base head  →  modifier tail
 *
 * The base head (`maj7`, `m7`, `7`, `sus4`, `6/9`, …) seeds a **degree→semitone
 * map**; each trailing modifier (`(♯5)`, `(♭9)`, `add9`, `no3`, a bare `sus4` on a
 * 7th, …) mutates that map by scale degree, so replacement (e.g. `♯5` overriding
 * the natural 5) is unambiguous and any combination composes for free. The sorted
 * map values become `ChordData.intervals` — the authoritative realised interval
 * set — but only when the chord is altered beyond its base `quality`; a plain
 * quality leaves `intervals` absent and derives its pitches from `quality`.
 *
 * Returns `null` for anything that isn't a recognised chord, so callers can skip
 * (and surface) typos rather than crash on user input.
 *
 * Slash/inversion symbols (`"C/E"`, `"D/F#"`, `"Am7/G"`) ARE parsed: the symbol
 * is split on its LAST `/` and the tail is treated as a bass **only if it parses
 * as a bare note** — so `"Eb6/9"` (tail `9`, not a note) stays a 6/9 chord rather
 * than being mis-read as a slash bass, while `"C6/E"` (tail `E`) is an inversion.
 * The chord part still has to be a recognised chord and the bass a recognised
 * note, else the whole symbol is unrecognised (`null`).
 */

import type { ChordData } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { qualitySymbol } from "./chords";

/** Note letter → natural pitch-class. */
const LETTER_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Read a bare note (letter A–G + accidentals) into its pitch class, or `null`.
 * Shared by the root parse and the slash-bass parse so the accidental math has
 * one home.
 */
function parseNotePc(s: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]*)$/.exec(s);
  if (!m) return null;

  let pc = LETTER_PC[m[1]!.toUpperCase()]!;
  for (const ch of m[2]!) {
    if (ch === "#" || ch === "♯") pc += 1;
    else if (ch === "b" || ch === "♭") pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

// ---------------------------------------------------------------------------
// Base heads
// ---------------------------------------------------------------------------

/**
 * A recognised base-quality prefix (`suffix`) and the canonical `quality` it
 * seeds. Matched **longest-first** against the body (a prefix, not the whole
 * remainder), so `"maj7"` wins over `"m"`, `"6/9"` over `"6"`, and the empty
 * `""` head (major triad) is the always-matching fallback whose modifier tail
 * then decides recognised-vs-typo. Includes the historical aliases so existing
 * spellings (`"major7"`, `"-7"`, `"ø"`, …) still normalise.
 */
const HEADS: ReadonlyArray<{ suffix: string; quality: string }> = [
  // ── extended (longest aliases first) ─────────────────────────────────────
  { suffix: "6/9", quality: "six9" },
  { suffix: "major9", quality: "maj9" },
  { suffix: "maj9", quality: "maj9" },
  { suffix: "M9", quality: "maj9" },
  { suffix: "min9", quality: "min9" },
  { suffix: "m9", quality: "min9" },
  { suffix: "-9", quality: "min9" },
  { suffix: "9", quality: "dom9" },
  { suffix: "13", quality: "dom13" },
  { suffix: "min6", quality: "min6" },
  { suffix: "m6", quality: "min6" },
  { suffix: "-6", quality: "min6" },
  { suffix: "6", quality: "maj6" },
  // ── suspended ────────────────────────────────────────────────────────────
  { suffix: "sus2", quality: "sus2" },
  { suffix: "sus4", quality: "sus4" },
  { suffix: "sus", quality: "sus4" },
  // ── 7th chords ───────────────────────────────────────────────────────────
  { suffix: "maj7", quality: "maj7" },
  { suffix: "major7", quality: "maj7" },
  { suffix: "M7", quality: "maj7" },
  { suffix: "minmaj7", quality: "minmaj7" },
  { suffix: "mM7", quality: "minmaj7" },
  { suffix: "min7", quality: "min7" },
  { suffix: "m7b5", quality: "halfdim7" },
  { suffix: "m7", quality: "min7" },
  { suffix: "-7", quality: "min7" },
  { suffix: "dom7", quality: "dom7" },
  { suffix: "7", quality: "dom7" },
  { suffix: "ø7", quality: "halfdim7" },
  { suffix: "ø", quality: "halfdim7" },
  { suffix: "dim7", quality: "dim7" },
  { suffix: "o7", quality: "dim7" },
  { suffix: "°7", quality: "dim7" },
  { suffix: "+M7", quality: "augmaj7" },
  { suffix: "augmaj7", quality: "augmaj7" },
  { suffix: "+7", quality: "aug7" },
  { suffix: "aug7", quality: "aug7" },
  // ── triads ─────────────────────────────────────────────────────────────--
  { suffix: "dim", quality: "dim" },
  { suffix: "°", quality: "dim" },
  { suffix: "o", quality: "dim" },
  { suffix: "aug", quality: "aug" },
  { suffix: "+", quality: "aug" },
  { suffix: "min", quality: "min" },
  { suffix: "m", quality: "min" },
  { suffix: "-", quality: "min" },
  { suffix: "maj", quality: "maj" },
  { suffix: "major", quality: "maj" },
  { suffix: "", quality: "maj" },
];

const HEADS_BY_LENGTH = [...HEADS].sort(
  (a, b) => b.suffix.length - a.suffix.length,
);

/**
 * Seed degree→semitone map per base quality (scale degree → semitones above the
 * root). Modifiers mutate this by degree. Kept consistent with `CHORD_TEMPLATES`
 * in chords.ts — the values equal that quality's interval set — so an unmodified
 * head realises exactly the template (though a plain head leaves `intervals`
 * absent and derives from `quality` directly).
 */
const SEED: Record<string, ReadonlyArray<readonly [number, number]>> = {
  maj: [[3, 4], [5, 7]],
  min: [[3, 3], [5, 7]],
  aug: [[3, 4], [5, 8]],
  dim: [[3, 3], [5, 6]],
  maj7: [[3, 4], [5, 7], [7, 11]],
  dom7: [[3, 4], [5, 7], [7, 10]],
  min7: [[3, 3], [5, 7], [7, 10]],
  minmaj7: [[3, 3], [5, 7], [7, 11]],
  halfdim7: [[3, 3], [5, 6], [7, 10]],
  dim7: [[3, 3], [5, 6], [7, 9]],
  augmaj7: [[3, 4], [5, 8], [7, 11]],
  aug7: [[3, 4], [5, 8], [7, 10]],
  maj6: [[3, 4], [5, 7], [6, 9]],
  min6: [[3, 3], [5, 7], [6, 9]],
  maj9: [[3, 4], [5, 7], [7, 11], [9, 14]],
  dom9: [[3, 4], [5, 7], [7, 10], [9, 14]],
  min9: [[3, 3], [5, 7], [7, 10], [9, 14]],
  dom13: [[3, 4], [5, 7], [7, 10], [9, 14], [13, 21]],
  sus2: [[2, 2], [5, 7]],
  sus4: [[4, 5], [5, 7]],
  six9: [[3, 4], [5, 7], [6, 9], [9, 14]],
};

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

/** Natural (unaltered) semitone for a scale degree. Alterations offset this. */
const NATURAL_DEGREE: Record<number, number> = {
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 10,
  9: 14,
  11: 17,
  13: 21,
};

type Modifier =
  | { kind: "sus"; deg: 2 | 4; len: number }
  | { kind: "omit"; deg: number; len: number }
  | { kind: "add"; deg: number; len: number }
  | { kind: "alt"; deg: number; acc: 1 | -1; len: number };

/**
 * One modifier token at the start of `rest`. Suspensions (`sus2`/`sus4`/`sus`),
 * omissions (`no3`/`omit5`), added tones (`add9`, or a bare natural tension
 * `6`/`9`/`11`/`13`), and altered tones (an accidental — `#`/`♯`/`+` sharp,
 * `b`/`♭`/`-` flat — before a degree). Bare `2`/`4`/`5` are intentionally NOT
 * added tones (`2`/`4` are the domain of `sus`; a bare `5` is ambiguous).
 */
const MODIFIER =
  /^(?:sus2|sus4|sus|(?:no|omit)(3|5)|add(2|4|6|9|11|13)|([+#♯b♭-])(2|4|5|6|9|11|13)|(6|9|11|13))/;

function matchModifier(rest: string): Modifier | null {
  const m = MODIFIER.exec(rest);
  if (!m) return null;
  const len = m[0].length;
  if (m[0] === "sus2") return { kind: "sus", deg: 2, len };
  if (m[0] === "sus4" || m[0] === "sus") return { kind: "sus", deg: 4, len };
  if (m[1]) return { kind: "omit", deg: Number(m[1]), len };
  if (m[2]) return { kind: "add", deg: Number(m[2]), len };
  if (m[3]) {
    const acc = m[3] === "+" || m[3] === "#" || m[3] === "♯" ? 1 : -1;
    return { kind: "alt", deg: Number(m[4]), acc, len };
  }
  if (m[5]) return { kind: "add", deg: Number(m[5]), len };
  return null;
}

/** Mutate the degree→semitone map by one modifier. */
function applyModifier(degrees: Map<number, number>, mod: Modifier): void {
  switch (mod.kind) {
    case "sus":
      degrees.delete(3);
      degrees.set(mod.deg, mod.deg === 2 ? 2 : 5);
      break;
    case "omit":
      degrees.delete(mod.deg);
      break;
    case "add":
      degrees.set(mod.deg, NATURAL_DEGREE[mod.deg]!);
      break;
    case "alt":
      degrees.set(mod.deg, NATURAL_DEGREE[mod.deg]! + mod.acc);
      break;
  }
}

/**
 * Canonical suffix for the modifier list, appended after the head suffix:
 * `sus2`/`sus4` first, then all altered tones grouped in a single degree-sorted
 * `(♯5♭9)`, then `addN`, then `(noN)`. E.g. `[alt ♯5]` → `"(♯5)"`, `[sus4, alt
 * ♭9]` → `"sus4(♭9)"`.
 */
function formatModifiers(mods: readonly Modifier[]): string {
  let out = "";
  const sus = mods.find((m) => m.kind === "sus");
  if (sus) out += sus.deg === 2 ? "sus2" : "sus4";

  const alts = mods
    .filter((m): m is Extract<Modifier, { kind: "alt" }> => m.kind === "alt")
    .sort((a, b) => a.deg - b.deg);
  if (alts.length > 0) {
    out += "(" + alts.map((a) => (a.acc > 0 ? "♯" : "♭") + a.deg).join("") + ")";
  }

  const adds = mods
    .filter((m) => m.kind === "add")
    .sort((a, b) => a.deg - b.deg);
  for (const a of adds) out += "add" + a.deg;

  const omits = mods
    .filter((m) => m.kind === "omit")
    .sort((a, b) => a.deg - b.deg);
  for (const o of omits) out += "(no" + o.deg + ")";

  return out;
}

// ---------------------------------------------------------------------------
// Body & symbol parsing
// ---------------------------------------------------------------------------

interface ParsedBody {
  quality: string;
  /** Realised interval set, or `null` when the chord is a plain head (no mods). */
  intervals: number[] | null;
  /** Canonical suffix (head suffix + rendered modifiers). */
  suffix: string;
}

/** Parse the body (everything after the root, no slash bass) or `null`. */
function parseBody(body: string): ParsedBody | null {
  const head = HEADS_BY_LENGTH.find((h) => body.startsWith(h.suffix));
  if (!head) return null; // unreachable — the "" head always matches.

  const degrees = new Map<number, number>(SEED[head.quality]);
  const mods: Modifier[] = [];

  let rest = body.slice(head.suffix.length);
  while (rest.length > 0) {
    const sep = /^[\s,()]+/.exec(rest);
    if (sep) {
      rest = rest.slice(sep[0].length);
      continue;
    }
    const mod = matchModifier(rest);
    if (!mod) return null; // unrecognised trailing text → typo.
    applyModifier(degrees, mod);
    mods.push(mod);
    rest = rest.slice(mod.len);
  }

  const suffix = qualitySymbol(head.quality) + formatModifiers(mods);
  const intervals =
    mods.length === 0
      ? null
      : Array.from(new Set(degrees.values())).sort((a, b) => a - b);
  return { quality: head.quality, intervals, suffix };
}

/**
 * Parse the chord part (root + body, no slash bass) into `ChordData`, or `null`
 * if unrecognised. The slash-bass handling lives in `parseChordSymbol`.
 */
function parseChordCore(s: string): ChordData | null {
  // Root: a letter A–G followed by any number of accidentals (# / b / ♯ / ♭).
  const m = /^([A-Ga-g])([#b♯♭]*)(.*)$/.exec(s);
  if (!m) return null;

  const letter = m[1]!.toUpperCase();
  const accidentals = m[2]!;
  const body = m[3]!;

  let root = LETTER_PC[letter]!;
  for (const ch of accidentals) {
    if (ch === "#" || ch === "♯") root += 1;
    else if (ch === "b" || ch === "♭") root -= 1;
  }
  root = ((root % 12) + 12) % 12;

  const parsed = parseBody(body);
  if (!parsed) return null;

  // Preserve the user's root spelling (so "Bbm7" stays "Bbm7", not "A#m7") and
  // append the canonical quality + modifier suffix.
  const rootText = letter + accidentals.replace(/♯/g, "#").replace(/♭/g, "b");
  const data: ChordData = {
    root,
    quality: parsed.quality,
    symbol: rootText + parsed.suffix,
  };
  if (parsed.intervals) data.intervals = parsed.intervals;
  return data;
}

/**
 * Parse a chord symbol string into `ChordData`, or `null` if unrecognised.
 * Supports an optional trailing `/X` slash bass (e.g. `"G/B"`, `"D/F#"`), split
 * on the LAST `/` and only when `X` parses as a bare note — so `"Eb6/9"` is a
 * 6/9 chord, not an E♭ over a `9` "bass".
 */
export function parseChordSymbol(input: string): ChordData | null {
  const s = input.trim();
  if (s.length === 0) return null;

  const slash = s.lastIndexOf("/");
  if (slash !== -1) {
    const bassText = s.slice(slash + 1).trim();
    const bass = parseNotePc(bassText);
    if (bass !== null) {
      const core = parseChordCore(s.slice(0, slash));
      if (!core) return null;
      const normalizedBassText = bassText
        .replace(/♯/g, "#")
        .replace(/♭/g, "b");
      return { ...core, bass, symbol: core.symbol + "/" + normalizedBassText };
    }
    // Tail isn't a note (e.g. the "9" in "6/9") — not a slash bass; fall through
    // and parse the whole string as the chord body.
  }

  return parseChordCore(s);
}
