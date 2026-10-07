/**
 * Sections for a tab that names none: its stanzas, labelled by chord repetition.
 *
 * Many UG tabs carry no `[Verse]` / `[Chorus]` headers, but still lay the song
 * out in stanzas separated by blank lines (`ParsedSection.stanzaBreaks`). A
 * stanza's chords say which part of the song it is: the verses share one
 * sequence, the refrains another. So each stanza with chords gets a letter —
 * stanzas whose chord sequences match share it (A, A, B, A, B), letters in order
 * of first appearance — and a lone chords-only stanza opening or closing the
 * song reads "Intro" / "Outro". The labels are structural, not functional:
 * nothing here guesses which letter is the chorus.
 *
 * "Match" tolerates small differences — a refrain whose last line drops a
 * chord, a verse with one passing chord — via the edit distance of the two
 * chord-symbol sequences against {@link MATCH_TOLERANCE}.
 *
 * A tab with any named section is left alone (`[]`): its author gave the
 * structure, and an inferred letter beside "Verse" would only contradict it.
 */

import type { ParsedLine, ParsedTab } from "./parse";

/** One inferred section: a run of lines of one parsed section, and its label. */
export interface InferredSection {
  /** Index into `ParsedTab.sections`. */
  section: number;
  /** First line of the stanza (index into that section's `lines`). */
  from: number;
  /** One past its last line. */
  to: number;
  /** "A", "B", … — or "Intro" / "Outro". */
  label: string;
}

/**
 * The share of the longer sequence two stanzas' chords may differ by (edits:
 * insert, delete, substitute) and still be the same section.
 */
const MATCH_TOLERANCE = 0.25;

/** A repeat count standing in a line's text ("x2", "(x4)", "2x"). */
const REPEAT_COUNT = /\(?\s*(?:[x×]\s*\d+|\d+\s*[x×])\s*\)?/gi;

/** Whether a line has words to sing — not just a repeat count or punctuation. */
function hasWords(line: ParsedLine): boolean {
  return /\p{L}/u.test(line.lyric.replace(REPEAT_COUNT, ""));
}

/** Levenshtein distance between two symbol sequences. */
function editDistance(a: readonly string[], b: readonly string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row.push(
        Math.min(
          prev[j]! + 1,
          row[j - 1]! + 1,
          prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    }
    prev = row;
  }
  return prev[b.length]!;
}

function matches(a: readonly string[], b: readonly string[]): boolean {
  const allowed = Math.floor(Math.max(a.length, b.length) * MATCH_TOLERANCE);
  return editDistance(a, b) <= allowed;
}

/** "A" … "Z", then "AA", "AB", … */
function letter(n: number): string {
  const head = Math.floor(n / 26);
  const tail = String.fromCharCode(65 + (n % 26));
  return head === 0 ? tail : letter(head - 1) + tail;
}

/** The stanzas of a tab with no named section, labelled; `[]` for a named tab. */
export function inferSections(parsed: ParsedTab): InferredSection[] {
  if (parsed.sections.some((s) => s.name.length > 0)) return [];

  // Every stanza with chords, in sheet order.
  const stanzas: {
    section: number;
    from: number;
    to: number;
    chords: string[];
    words: boolean;
  }[] = [];
  parsed.sections.forEach((section, si) => {
    const bounds = [0, ...section.stanzaBreaks, section.lines.length];
    for (let k = 0; k + 1 < bounds.length; k++) {
      const lines = section.lines.slice(bounds[k], bounds[k + 1]);
      const chords = lines.flatMap((l) => l.chords.map((c) => c.symbol));
      if (chords.length === 0) continue;
      stanzas.push({
        section: si,
        from: bounds[k]!,
        to: bounds[k + 1]!,
        chords,
        words: lines.some(hasWords),
      });
    }
  });

  // Cluster: each stanza joins the first earlier group it matches.
  const groupOf: number[] = [];
  const heads: string[][] = [];
  for (const stanza of stanzas) {
    const g = heads.findIndex((head) => matches(head, stanza.chords));
    if (g >= 0) groupOf.push(g);
    else {
      groupOf.push(heads.length);
      heads.push(stanza.chords);
    }
  }
  const size = (g: number) => groupOf.filter((x) => x === g).length;
  const edge = (i: number) =>
    !stanzas[i]!.words && size(groupOf[i]!) === 1 && stanzas.length > 1;

  const labels = new Map<number, string>();
  return stanzas.map((stanza, i) => {
    let label: string;
    if (i === 0 && edge(i)) label = "Intro";
    else if (i === stanzas.length - 1 && edge(i)) label = "Outro";
    else {
      const g = groupOf[i]!;
      label = labels.get(g) ?? letter(labels.size);
      labels.set(g, label);
    }
    return { section: stanza.section, from: stanza.from, to: stanza.to, label };
  });
}
