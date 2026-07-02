/**
 * Compile a parsed Ultimate Guitar tab → `Score`.
 *
 * UG tabs are **untimed**: they ship ordered sections of lines, each line
 * carrying chords positioned over its lyric, but no tempo, time signature, or
 * note durations. So unlike the MIDI source (which reads timing off the file)
 * or the chord-grid source (which defers tempo/time-sig to a merged source),
 * this compiler **synthesizes** a timeline and therefore *owns* the tempo and
 * time-signature maps.
 *
 * Timing model — **lyric-proportional, bar-quantized** with one global beat
 * cursor:
 *
 *  - Every bar is `UG_BEATS_PER_BAR` beats (4/4), at `UG_DEFAULT_TEMPO_BPM`.
 *  - Each line is given a whole number of bars from its *sung width* (the longer
 *    of its lyric length and its last chord's column), via `UG_CHARS_PER_BAR` —
 *    so longer lines last longer. Lines always land on a bar boundary (the meter
 *    stays intact) but their length tracks how much is actually sung.
 *  - Within a line, chords are placed *proportionally to their lyric column*
 *    (`charOffset`), each sustaining until the next chord's column (the last one
 *    to the line's end). So the chord rhythm matches the words instead of a flat
 *    one-bar-per-chord metronome. An unrecognised symbol (e.g. `"N.C."`) still
 *    occupies its proportional slot, so later chords keep their place.
 *  - A blank line (no lyric, no chords) still occupies one bar, so the songsheet
 *    scrolls through it rather than collapsing it to a zero-width instant.
 *  - A line with a lyric OR chords emits a `lyric` annotation spanning its whole
 *    bar range — so chord-only / instrumental lines render in the songsheet too.
 *    It carries the RAW lyric text (leading columns align chords) plus the line's
 *    chords as `{ symbol, charOffset, beat }` (every parsed symbol, recognised or
 *    not, so the printed page is faithful even where the harmony timeline drops a
 *    symbol).
 *  - A named section emits a `section` annotation spanning all its lines; an
 *    implicit (`name:""`) section emits none but still emits its chords/lyrics.
 *
 * Recognised chords become `source:"authored"` chord annotations. The chord
 * *notes* are not produced here — the shell's reactive re-voicing step
 * regenerates them from those annotations under the global voicing config, so
 * this source emits annotations only. Capo is intentionally ignored here (it's
 * surfaced on the extension row, not transposed into the Score). The key string
 * is parsed into `meta.key`.
 */

import type {
  Annotation,
  ChordData,
  KeySignature,
  LyricChord,
  LyricData,
  Score,
  SectionData,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  parseChordSymbol,
  parseKeySignature,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import {
  parseUgTab,
  UgTabSchema,
  type ParsedLine,
  type ParsedTab,
} from "../core";

/** Bar length in quarter-note beats (4/4). */
export const UG_BEATS_PER_BAR = 4;
/** Synthesized tempo — UG carries no tempo of its own. */
export const UG_DEFAULT_TEMPO_BPM = 100;
/**
 * Lyric characters that map to one synthesized bar. Sets how a line's *sung
 * width* becomes its duration: bar count = round(width / this). ~12 chars/bar
 * at 100 BPM 4/4 ≈ a natural singing rate.
 */
export const UG_CHARS_PER_BAR = 12;

/**
 * A line's *sung width* in visible columns: the longer of its trimmed lyric and
 * its last chord's column (+1 so a trailing chord still owns a sliver of time).
 * Trailing whitespace is dropped — it isn't sung and would inflate the bar count.
 */
function sungWidth(line: ParsedLine): number {
  const lyricWidth = line.lyric.replace(/\s+$/u, "").length;
  const lastChordCol =
    line.chords.length > 0
      ? line.chords[line.chords.length - 1]!.charOffset + 1
      : 0;
  return Math.max(lyricWidth, lastChordCol);
}

/**
 * Whole-bar duration for a line of the given sung width and chord count.
 * Bar-quantized: every line lands on a bar boundary so the global meter stays
 * intact. At least one bar, and never so few that chords average below a beat.
 */
function lineBarCount(width: number, chordCount: number): number {
  const fromWidth = Math.round(width / UG_CHARS_PER_BAR);
  const fromChords = Math.ceil(chordCount / UG_BEATS_PER_BAR);
  return Math.max(1, fromWidth, fromChords);
}

/**
 * Synthesize a `Score` from an already-parsed UG tab. Pure and testable — feed
 * it a hand-built `ParsedTab` (no network / no `UgTab` needed).
 */
export function synthesizeScore(parsed: ParsedTab, title?: string): Score {
  const annotations: Annotation[] = [];

  let cursor = 0; // global beat cursor

  for (const section of parsed.sections) {
    const sectionStart = cursor;

    for (const line of section.lines) {
      const lineStart = cursor;
      // The line's chords as printed-page data — every parsed symbol, recognised
      // or not, anchored to its visible column. This is the faithful songsheet
      // line; the chord-annotation timeline below keeps only the recognised harmony.
      const lineChords: LyricChord[] = [];

      // Bar-quantized line duration, then chords laid out *proportionally* to
      // their lyric column within it — so the chord rhythm tracks the words, not
      // a flat bar-per-chord metronome. `width > 0` whenever there are chords, so
      // the division below is safe (a blank, chord-less line just advances a bar).
      const width = sungWidth(line);
      const lineBeats =
        lineBarCount(width, line.chords.length) * UG_BEATS_PER_BAR;
      const lineEnd = lineStart + lineBeats;

      line.chords.forEach((chord, i) => {
        const start = lineStart + (chord.charOffset / width) * lineBeats;
        const next = line.chords[i + 1];
        // A chord sustains until the next chord's column — the last one to the
        // line's end. An unrecognised symbol still claims its slot (no chord
        // emitted) so the following chord keeps its proportional place.
        const end = next
          ? lineStart + (next.charOffset / width) * lineBeats
          : lineEnd;
        lineChords.push({
          symbol: chord.symbol,
          charOffset: chord.charOffset,
          beat: start,
        });
        const data = parseChordSymbol(chord.symbol);
        if (data) {
          annotations.push({
            type: "chord",
            start,
            end,
            data,
            source: "authored",
          } satisfies Annotation<"chord", ChordData>);
        }
      });

      cursor = lineEnd;

      if (line.lyric.trim().length > 0 || lineChords.length > 0) {
        annotations.push({
          type: "lyric",
          start: lineStart,
          end: cursor,
          // RAW lyric — leading columns are load-bearing for chord alignment —
          // plus the chords printed over it by column (possibly text:"" for a
          // chord-only / instrumental line).
          data: { text: line.lyric, chords: lineChords },
          source: "authored",
        } satisfies Annotation<"lyric", LyricData>);
      }
    }

    if (section.name.length > 0 && cursor > sectionStart) {
      annotations.push({
        type: "section",
        start: sectionStart,
        end: cursor,
        data: { name: section.name },
        source: "authored",
      } satisfies Annotation<"section", SectionData>);
    }
  }

  const key: KeySignature | null = parseKeySignature(parsed.key);

  return {
    meta: {
      ...(title !== undefined ? { title } : {}),
      ...(key !== null ? { key } : {}),
    },
    // No tracks / notes — the shell's re-voicing step owns chord-note
    // generation from these `source:"authored"` chord annotations.
    tracks: [],
    tempoMap: [{ beat: 0, bpm: UG_DEFAULT_TEMPO_BPM }],
    timeSigMap: [{ beat: 0, numerator: 4, denominator: 4 }],
    notes: [],
    annotations,
    // UG tabs carry no pedaling; the re-voicing step generates plain notes.
    pedalEvents: [],
  };
}

/**
 * Collect the chord symbols this tab would *drop* on compile — the ones
 * `parseChordSymbol` can't recognise (e.g. `"N.C."`, exotic suffixes).
 * `synthesizeScore` still advances a bar for each (timing is preserved) but
 * emits no chord annotation for them, so without surfacing these a tab can
 * quietly play with missing chords. Mirrors chord-grid's `skipped` list.
 *
 * Returns the deduplicated set in first-seen order. Shares the exact
 * recognise-gate (`parseChordSymbol`) with `synthesizeScore`, so the two can
 * never disagree about which symbols are dropped.
 */
export function collectUnrecognisedChords(parsed: ParsedTab): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const section of parsed.sections) {
    for (const line of section.lines) {
      for (const chord of line.chords) {
        if (parseChordSymbol(chord.symbol) === null && !seen.has(chord.symbol)) {
          seen.add(chord.symbol);
          out.push(chord.symbol);
        }
      }
    }
  }
  return out;
}

/**
 * Slot-facing compile: validate the raw UG tab shape (loud failure on
 * mismatch), parse its markup, and synthesize the `Score`.
 */
export function compile(raw: unknown): Score {
  const tab = UgTabSchema.parse(raw);
  return synthesizeScore(parseUgTab(tab), tab.songName);
}
