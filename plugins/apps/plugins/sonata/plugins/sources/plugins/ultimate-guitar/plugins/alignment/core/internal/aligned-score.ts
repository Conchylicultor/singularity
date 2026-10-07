/**
 * An alignment record → the `Score` the UG source compiles to.
 *
 * - **Tempo.** Score beat 0 is t = 0 s. The audio before the first detected
 *   beat is a lead-in of `n = max(1, round(t₀ / firstInterval))` beats at
 *   `60·n / t₀` bpm; then one tempo event per detected beat (`60 / Δt`), the
 *   last one ending at `durationSec`. Detected beat `i` is Score beat `n + i`.
 * - **Meter.** The lead-in and the beats before the first downbeat are the
 *   pickup (`meta.pickupBeats`); a time signature `<bar length>/4` starts at
 *   beat 0 and changes wherever the bar length does.
 * - **Annotations, in performance order** (the shapes of `synthesizeScore`):
 *   one chord annotation per chord segment; one lyric annotation per line
 *   occurrence (a line looped "x2" appears twice), with the line's chords at
 *   the beats they were found on; lyric-only lines share the span of the chord
 *   line above them; one section annotation per section occurrence, and one
 *   named "Not in sheet" per gap.
 * - **Pitch.** Built at sheet pitch, then `transposeScore` to the recording's
 *   sounding pitch, so the synth plays in the recording's key.
 * - **Recording.** `meta.recording` names the video, so the player can play it
 *   as the Score's clock: the tempo map above makes score seconds its seconds.
 */

import type {
  Annotation,
  ChordData,
  KeySignature,
  LyricChord,
  LyricData,
  Score,
  SectionData,
  TempoEvent,
  TimeSigEvent,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  parseChordSymbol,
  parseKeySignature,
  transposeKey,
  transposeScore,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";
import type {
  ParsedLine,
  ParsedTab,
} from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import {
  ALIGNER_VERSION,
  sheetHash,
  type AlignmentRecord,
  type AlignmentSegment,
} from "./record";
import { isRepeatMarker } from "./sheet";

/** The section name a gap's annotation carries. */
export const GAP_SECTION_NAME = "Not in sheet";

/**
 * Whether `record` was made for the sheet `content` by the current aligner —
 * the only condition for applying it. The score is NOT one: a weak match is
 * applied too (the song plays on its best try, and the Recording section says
 * it is unconfirmed); `WEAK_MATCH_THRESHOLD` only decides whether the
 * resolver keeps looking for a better video.
 */
export function fitsSheet(record: AlignmentRecord, content: string): boolean {
  return (
    record.alignerVersion === ALIGNER_VERSION &&
    record.sheetHash === sheetHash(content)
  );
}

type ChordSegment = Extract<AlignmentSegment, { kind: "chord" }>;

/** Lead-in beats before the first detected beat (0 only when it is at t = 0). */
function leadIn(record: AlignmentRecord): number {
  const t0 = record.beats[0]!.t;
  if (t0 <= 0) return 0;
  const next =
    record.beats.length > 1 ? record.beats[1]!.t : record.durationSec;
  return Math.max(1, Math.round(t0 / (next - t0)));
}

function tempoMap(record: AlignmentRecord, n: number): TempoEvent[] {
  const { beats } = record;
  const map: TempoEvent[] = [];
  if (n > 0) map.push({ beat: 0, bpm: (60 * n) / beats[0]!.t });
  let dt = 0;
  beats.forEach((beat, i) => {
    const end = i + 1 < beats.length ? beats[i + 1]!.t : record.durationSec;
    // A last beat at (or past) the end of the audio keeps the tempo before it.
    if (end > beat.t) dt = end - beat.t;
    if (dt <= 0)
      throw new Error(`Alignment beat grid is not increasing at beat ${i}.`);
    map.push({ beat: n + i, bpm: 60 / dt });
  });
  return map;
}

function meter(
  record: AlignmentRecord,
  n: number,
): { timeSigMap: TimeSigEvent[]; pickup: number } {
  const downbeats: number[] = [];
  record.beats.forEach((b, i) => {
    if (b.downbeat) downbeats.push(i);
  });
  if (downbeats.length < 2) {
    return {
      timeSigMap: [{ beat: 0, numerator: 4, denominator: 4 }],
      pickup: n + (downbeats[0] ?? 0),
    };
  }
  const timeSigMap: TimeSigEvent[] = [];
  for (let k = 0; k + 1 < downbeats.length; k++) {
    const len = downbeats[k + 1]! - downbeats[k]!;
    if (
      timeSigMap.length > 0 &&
      timeSigMap[timeSigMap.length - 1]!.numerator === len
    )
      continue;
    timeSigMap.push({
      beat: k === 0 ? 0 : n + downbeats[k]!,
      numerator: len,
      denominator: 4,
    });
  }
  return { timeSigMap, pickup: n + downbeats[0]! };
}

/** Visible width of a line, for sharing a span between lines (at least 1). */
function width(line: ParsedLine): number {
  const last =
    line.chords.length > 0
      ? line.chords[line.chords.length - 1]!.charOffset + 1
      : 0;
  return Math.max(1, line.lyric.trimEnd().length, last);
}

/**
 * Build the aligned `Score` of `parsed` from `record`. The caller checks
 * {@link fitsSheet} first; a record whose indices do not fit the sheet throws.
 */
export function alignedScore(
  parsed: ParsedTab,
  record: AlignmentRecord,
  title?: string,
): Score {
  if (record.beats.length === 0)
    throw new Error("Cannot build a Score from an alignment with no beats.");
  const n = leadIn(record);
  const { timeSigMap, pickup } = meter(record, n);
  const annotations: Annotation[] = [];

  const lineAt = (seg: ChordSegment): ParsedLine => {
    const line = parsed.sections[seg.section]?.lines[seg.line];
    if (line === undefined || line.chords[seg.chord] === undefined) {
      throw new Error(
        `Alignment segment ${seg.section}/${seg.line}/${seg.chord} names no chord of this sheet.`,
      );
    }
    return line;
  };

  // Group the segments: gaps stand alone; chord segments form section
  // occurrences (same section + occurrence), each a run of line occurrences
  // (a new one when the line changes or starts over, as a line marked "x2" does).
  type LineOcc = { line: number; segments: ChordSegment[] };
  type Group =
    | { kind: "gap"; start: number; end: number }
    | { kind: "section"; section: number; lines: LineOcc[] };
  const groups: Group[] = [];
  for (const seg of record.segments) {
    if (seg.kind === "gap") {
      groups.push({ kind: "gap", start: seg.startBeat, end: seg.endBeat });
      continue;
    }
    lineAt(seg);
    const last = groups[groups.length - 1];
    const prev =
      last?.kind === "section"
        ? last.lines[last.lines.length - 1]!.segments.at(-1)!
        : null;
    if (
      last?.kind !== "section" ||
      prev === null ||
      prev.section !== seg.section ||
      prev.occurrence !== seg.occurrence
    ) {
      groups.push({
        kind: "section",
        section: seg.section,
        lines: [{ line: seg.line, segments: [seg] }],
      });
      continue;
    }
    const occ = last.lines[last.lines.length - 1]!;
    if (prev.line !== seg.line || seg.chord <= prev.chord)
      last.lines.push({ line: seg.line, segments: [seg] });
    else occ.segments.push(seg);
  }

  for (const group of groups) {
    if (group.kind === "gap") {
      annotations.push({
        type: "section",
        start: n + group.start,
        end: n + group.end,
        data: { name: GAP_SECTION_NAME },
        source: "authored",
      } satisfies Annotation<"section", SectionData>);
      continue;
    }
    const section = parsed.sections[group.section]!;
    const first = group.lines[0]!.segments[0]!;
    const lastLine = group.lines[group.lines.length - 1]!;
    const sectionEnd =
      n + lastLine.segments[lastLine.segments.length - 1]!.endBeat;

    for (const occ of group.lines) {
      const line = section.lines[occ.line]!;
      const start = n + occ.segments[0]!.startBeat;
      const end = n + occ.segments[occ.segments.length - 1]!.endBeat;

      for (const seg of occ.segments) {
        const data = parseChordSymbol(line.chords[seg.chord]!.symbol);
        if (data === null) continue;
        annotations.push({
          type: "chord",
          start: n + seg.startBeat,
          end: n + seg.endBeat,
          data,
          source: "authored",
        } satisfies Annotation<"chord", ChordData>);
      }

      // The lyric-only lines this chord line carries: those below it up to the
      // next chord line (and, for the section's first chord line, those above it).
      const carried: ParsedLine[] = [];
      const firstChordLine = section.lines.findIndex(
        (l) => l.chords.length > 0,
      );
      const from = occ.line === firstChordLine ? 0 : occ.line + 1;
      for (let li = from; li < section.lines.length; li++) {
        if (li === occ.line) continue;
        const l = section.lines[li]!;
        if (l.chords.length > 0) {
          if (li > occ.line) break;
          continue;
        }
        if (!isRepeatMarker(l.lyric)) carried.push(l);
      }

      // The chord line keeps at least up to just past its last chord; carried
      // lines share the rest by width.
      const lastChordStart =
        n + occ.segments[occ.segments.length - 1]!.startBeat;
      const total = width(line) + carried.reduce((s, l) => s + width(l), 0);
      const split = Math.max(
        start + ((end - start) * width(line)) / total,
        lastChordStart + Math.min(1, (end - lastChordStart) / 2),
      );
      const chords: LyricChord[] = line.chords.map((chord, ci) => {
        const seg = occ.segments.find((s) => s.chord === ci);
        return {
          symbol: chord.symbol,
          charOffset: chord.charOffset,
          beat: seg ? n + seg.startBeat : end,
        };
      });
      annotations.push({
        type: "lyric",
        start,
        end: split,
        data: { text: line.lyric, chords },
        source: "authored",
      } satisfies Annotation<"lyric", LyricData>);
      const rest = carried.reduce((s, l) => s + width(l), 0);
      let cursor = split;
      for (const l of carried) {
        const next = cursor + ((end - split) * width(l)) / rest;
        annotations.push({
          type: "lyric",
          start: cursor,
          end: next,
          data: { text: l.lyric, chords: [] },
          source: "authored",
        } satisfies Annotation<"lyric", LyricData>);
        cursor = next;
      }
    }

    if (section.name.length > 0) {
      annotations.push({
        type: "section",
        start: n + first.startBeat,
        end: sectionEnd,
        data: { name: section.name },
        source: "authored",
      } satisfies Annotation<"section", SectionData>);
    }
  }

  // UG's key is the SOUNDING key, capo applied (Wonderwall: "F#m" over Em
  // shapes, capo 2), while the chords are shapes. The Score is built at sheet
  // (shape) pitch, so its key is the UG key less the capo; the shift below then
  // carries both to the recording's pitch together.
  const ugKey = parseKeySignature(parsed.key);
  const key: KeySignature | null =
    ugKey === null ? null : transposeKey(ugKey, -parsed.capo);
  const score: Score = {
    meta: {
      ...(title !== undefined ? { title } : {}),
      ...(key !== null ? { key } : {}),
      ...(pickup > 0 ? { pickupBeats: pickup } : {}),
      // Score beat 0 is t = 0 s of this video, so its seconds are the Score's.
      recording: {
        provider: "youtube",
        videoId: record.videoId,
        durationSec: record.durationSec,
      },
    },
    // No tracks / notes: the shell's re-voicing step generates the chord notes.
    tracks: [],
    tempoMap: tempoMap(record, n),
    timeSigMap,
    notes: [],
    annotations,
    pedalEvents: [],
  };
  // Sounding pitch: the nearest signed shift, so a capo 2 reads +2, not −10.
  const shift = record.transpose > 6 ? record.transpose - 12 : record.transpose;
  return transposeScore(score, shift);
}
