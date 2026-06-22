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
 * Timing model — **chord-per-bar** with one global beat cursor:
 *
 *  - Every bar is `UG_BEATS_PER_BAR` beats (4/4), at `UG_DEFAULT_TEMPO_BPM`.
 *  - A line with chords lays each chord out across exactly one bar, in order.
 *    The cursor advances one bar per chord — even when a chord symbol is
 *    unrecognised (e.g. `"N.C."`) — so a later chord/lyric keeps its alignment.
 *  - A lyric-only line still occupies one bar, so the songsheet scrolls through
 *    it rather than collapsing it to a zero-width instant.
 *  - A line with non-empty lyric emits a `lyric` annotation spanning its whole
 *    bar range, carrying the RAW lyric text (leading columns align chords).
 *  - A named section emits a `section` annotation spanning all its lines; an
 *    implicit (`name:""`) section emits none but still emits its chords/lyrics.
 *
 * Recognised chords become `source:"authored"` chord annotations + `ChordEvent`s;
 * the selected voicing strategy *derives* the literal notes from those events.
 * Capo is intentionally ignored here (it's surfaced on the extension row, not
 * transposed into the Score). The key string is parsed into `meta.key`.
 */

import type {
  Annotation,
  ChordData,
  KeySignature,
  LyricData,
  Note,
  Score,
  SectionData,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  parseChordSymbol,
  parseKeySignature,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import {
  DEFAULT_VOICING_ID,
  findVoicing,
  type ChordEvent,
} from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import { parseUgTab, UgTabSchema, type ParsedTab } from "../core";

/** Track id for the single synthesized UG track. */
export const UG_TRACK = "ug0";
/** Note-id prefix for voiced UG notes. */
export const UG_NOTE_PREFIX = "ug";
/** Bar length in quarter-note beats (4/4). */
export const UG_BEATS_PER_BAR = 4;
/** Synthesized tempo — UG carries no tempo of its own. */
export const UG_DEFAULT_TEMPO_BPM = 100;

/**
 * Synthesize a `Score` from an already-parsed UG tab. Pure and testable — feed
 * it a hand-built `ParsedTab` (no network / no `UgTab` needed).
 */
export function synthesizeScore(parsed: ParsedTab, title?: string): Score {
  const annotations: Annotation[] = [];
  const events: ChordEvent[] = [];

  let cursor = 0; // global beat cursor

  for (const section of parsed.sections) {
    const sectionStart = cursor;

    for (const line of section.lines) {
      const lineStart = cursor;

      if (line.chords.length > 0) {
        for (const chord of line.chords) {
          const start = cursor;
          const end = start + UG_BEATS_PER_BAR;
          const data = parseChordSymbol(chord.symbol);
          if (data) {
            annotations.push({
              type: "chord",
              start,
              end,
              data,
              source: "authored",
            } satisfies Annotation<"chord", ChordData>);
            events.push({ data, start, end });
          }
          // Advance regardless of parse success so later chords/lyrics keep
          // their alignment (e.g. an unrecognised "N.C." still costs a bar).
          cursor = end;
        }
      } else {
        // Lyric-only line: still occupies exactly one bar.
        cursor += UG_BEATS_PER_BAR;
      }

      if (line.lyric.trim().length > 0) {
        annotations.push({
          type: "lyric",
          start: lineStart,
          end: cursor,
          // RAW lyric — leading columns are load-bearing for chord alignment.
          data: { text: line.lyric },
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

  const notes: Note[] = findVoicing(DEFAULT_VOICING_ID).voice(events, {
    octave: 4,
    track: UG_TRACK,
    idPrefix: UG_NOTE_PREFIX,
  });

  const key: KeySignature | null = parseKeySignature(parsed.key);

  return {
    meta: {
      ...(title !== undefined ? { title } : {}),
      ...(key !== null ? { key } : {}),
    },
    tracks: [{ id: UG_TRACK, name: "Ultimate Guitar" }],
    tempoMap: [{ beat: 0, bpm: UG_DEFAULT_TEMPO_BPM }],
    timeSigMap: [{ beat: 0, numerator: 4, denominator: 4 }],
    notes,
    annotations,
  };
}

/**
 * Slot-facing compile: validate the raw UG tab shape (loud failure on
 * mismatch), parse its markup, and synthesize the `Score`.
 */
export function compile(raw: unknown): Score {
  const tab = UgTabSchema.parse(raw);
  return synthesizeScore(parseUgTab(tab), tab.songName);
}
