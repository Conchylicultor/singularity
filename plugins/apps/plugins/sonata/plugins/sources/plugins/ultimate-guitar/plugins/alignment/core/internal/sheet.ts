/**
 * The sheet model the aligner decodes over: a parsed UG tab reduced to blocks
 * of chord tokens in sheet order.
 *
 * - One block per section that has chords. A section with no chords whose
 *   normalised name matches an earlier section with chords ("[Chorus]" written
 *   out once, then only named) becomes a block holding that section's tokens —
 *   the tokens keep pointing at the chords where they are written, so the
 *   record's `section/line/chord` indices always name a real chord.
 * - Repeat hints: a section named "Chorus x2" repeats cheaply. A chord line
 *   whose only text is a count (UG's "Em7 G Dsus4 A7sus4   x4"), or with a
 *   line holding only the count right under it, is unrolled: its tokens are
 *   written that many times in a row, so the decoder plays it exactly that
 *   often. The end of every copy but the last may skip past the remaining
 *   copies (`skips`), for a performance that repeats it fewer times. A loop
 *   back instead would let one generic line absorb a whole song.
 * - Chord-diagram lines ("Em7  0-2-2-0-3-3", common at the top of a tab) are
 *   chord definitions, not part of the song: they yield no tokens.
 */

import type { ParsedTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { chordShape, shapeKey, type ChordShape } from "./templates";

/** One sheet chord, as a decoding state. */
export interface SheetToken {
  /** Indices into the parsed tab where this chord is written. */
  section: number;
  line: number;
  chord: number;
  /** The chord as written there. */
  symbol: string;
  /** Index into {@link AlignSheet.shapes}, or `null` for a symbol theory cannot read. */
  shape: number | null;
}

/** A contiguous run of tokens the performance enters at its first token. */
export interface SheetBlock {
  /** Normalised name ("Chorus 2" → "chorus"); `""` for an unnamed section. */
  name: string;
  /** The parsed section whose occurrence count an entry increments (the source, for an inheriting block). */
  section: number;
  tokens: SheetToken[];
  /** The section is marked to repeat ("Chorus x2"). */
  repeatHint: boolean;
  /**
   * Shortcuts past the unrolled copies of a repeated line, as token offsets:
   * from the last token of a copy to the token after the last copy, or
   * `tokens.length` to leave the block as from its last token.
   */
  skips: { from: number; to: number }[];
}

export interface AlignSheet {
  blocks: SheetBlock[];
  /** Distinct chord shapes the tokens use. */
  shapes: ChordShape[];
}

/** "x2", "(x2)", "×3", "2x" — a repeat count on its own. */
const REPEAT_ONLY = /^\(?\s*(?:[x×]\s*\d+|\d+\s*[x×])\s*\)?$/i;
/** The same count trailing a section name. */
const REPEAT_SUFFIX = /\s*\(?\s*(?:[x×]\s*\d+|\d+\s*[x×])\s*\)?\s*$/i;
/** A fret diagram: four or more fret marks (`0-2-2-0-3-3`, `x32010`). */
const FRET_DIAGRAM = /^[0-9xX](?:[-\s]?[0-9xX]){3,}$/;

/** A line whose only text is a repeat count ("x2"): a marker, not a lyric. */
export function isRepeatMarker(text: string): boolean {
  return REPEAT_ONLY.test(text.trim());
}

/** Most copies a repeated line is unrolled to: beyond it, the chords hold. */
const MAX_LINE_COPIES = 8;

/** The count of a repeat marker ("x4" → 4), within `[1, MAX_LINE_COPIES]`. */
function repeatCount(text: string): number {
  const n = Number(/\d+/.exec(text)?.[0] ?? "1");
  return Math.min(MAX_LINE_COPIES, Math.max(1, n));
}

/** "Chorus 2" → "chorus", "Pre-Chorus" → "prechorus", "Verse 1 x2" → "verse". */
export function normalizeSectionName(name: string): string {
  return name
    .replace(REPEAT_SUFFIX, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * Reduce a parsed tab to its {@link AlignSheet}. Throws when no section holds
 * a chord: there is nothing to align.
 */
export function buildAlignSheet(parsed: ParsedTab): AlignSheet {
  const shapes: ChordShape[] = [];
  const shapeIndex = new Map<string, number>();
  const shapeOf = (symbol: string): number | null => {
    const shape = chordShape(symbol);
    if (shape === null) return null;
    const key = shapeKey(shape);
    let i = shapeIndex.get(key);
    if (i === undefined) {
      i = shapes.length;
      shapes.push(shape);
      shapeIndex.set(key, i);
    }
    return i;
  };

  const blocks: SheetBlock[] = [];
  /** The latest block written out (not inherited) per normalised name. */
  const writtenByName = new Map<string, SheetBlock>();

  parsed.sections.forEach((section, si) => {
    const name = normalizeSectionName(section.name);
    const repeatHint = REPEAT_SUFFIX.test(section.name) && name.length > 0;

    // The chord lines, each with how many times it is played.
    const lines: { line: number; copies: number }[] = [];
    section.lines.forEach((line, li) => {
      const text = line.lyric.trim();
      if (line.chords.length === 0) {
        // A lone "x2" under a chord line repeats that line.
        const last = lines.at(-1);
        if (REPEAT_ONLY.test(text) && last !== undefined)
          last.copies = repeatCount(text);
        return;
      }
      if (FRET_DIAGRAM.test(text)) return;
      lines.push({
        line: li,
        copies: REPEAT_ONLY.test(text) ? repeatCount(text) : 1,
      });
    });

    const tokens: SheetToken[] = [];
    const copyEnds: number[][] = [];
    for (const { line, copies } of lines) {
      const ends: number[] = [];
      for (let c = 0; c < copies; c++) {
        section.lines[line]!.chords.forEach((chord, ci) => {
          tokens.push({
            section: si,
            line,
            chord: ci,
            symbol: chord.symbol,
            shape: shapeOf(chord.symbol),
          });
        });
        ends.push(tokens.length - 1);
      }
      copyEnds.push(ends);
    }
    // From the end of any copy but the last, past the remaining ones.
    const skips: { from: number; to: number }[] = [];
    for (const ends of copyEnds) {
      const after = ends.at(-1)! + 1;
      for (const end of ends.slice(0, -1)) skips.push({ from: end, to: after });
    }

    if (tokens.length > 0) {
      const block: SheetBlock = {
        name,
        section: si,
        tokens,
        repeatHint,
        skips,
      };
      blocks.push(block);
      if (name.length > 0) writtenByName.set(name, block);
      return;
    }
    const source = name.length > 0 ? writtenByName.get(name) : undefined;
    if (source !== undefined) {
      blocks.push({
        name,
        section: source.section,
        tokens: source.tokens,
        repeatHint: repeatHint || source.repeatHint,
        skips: source.skips,
      });
    }
  });

  if (blocks.length === 0) {
    throw new Error("Cannot align a sheet with no chords.");
  }
  return { blocks, shapes };
}
