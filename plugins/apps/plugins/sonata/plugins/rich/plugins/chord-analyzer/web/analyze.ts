/**
 * The chord Analyzer: pure `(Score) => Annotation[]`.
 *
 * Strategy: slice the score into windows at every distinct note onset, gather
 * the pitches sounding across each window, run `detectChord`, and emit one
 * `chord` annotation per window where a chord is recognised. Adjacent windows
 * that resolve to the same chord symbol are coalesced into a single annotation
 * so the timeline isn't littered with repeated labels.
 *
 * Every emitted annotation is `source: "derived"` — analyzers never author
 * truth, so `mergeAnnotations` keeps them strictly additive.
 *
 * When a chord-authoring source (e.g. the chord grid) is part of the score, its
 * chords are present as `source:"authored"` annotations with backing voiced
 * notes. Re-deriving chords over those notes would double-render in the overlay,
 * so detection skips any window already covered by an authored chord — leaving
 * authored truth as the sole label there, while still analysing note-only
 * regions (e.g. a merged MIDI track) that have no authored coverage.
 */

import type {
  Annotation,
  ChordData,
  Note,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { detectChord } from "./components/chord-detect";

/** A note is sounding in `[start, end)` when its span overlaps the window. */
function isSounding(n: Note, start: number, end: number): boolean {
  const noteEnd = n.start + n.duration;
  return n.start < end && noteEnd > start;
}

interface WindowChord {
  start: number;
  end: number;
  data: ChordData;
  confidence: number;
  noteIds: string[];
}

export function analyze(score: Score): Annotation[] {
  if (score.notes.length === 0) return [];

  // Spans already labelled by an authored chord — detection skips windows that
  // overlap these so authored truth is never duplicated by a derived chord.
  const authoredSpans = score.annotations
    .filter((a) => a.type === "chord" && a.source === "authored")
    .map((a) => ({ start: a.start, end: a.end }));
  const isAuthored = (start: number, end: number): boolean =>
    authoredSpans.some((s) => start < s.end && end > s.start);

  // Window boundaries = every distinct onset, plus the final note-off, so each
  // window has a constant set of sounding pitches.
  const boundarySet = new Set<number>();
  for (const n of score.notes) {
    boundarySet.add(n.start);
    boundarySet.add(n.start + n.duration);
  }
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  const windows: WindowChord[] = [];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    if (end <= start) continue;
    if (isAuthored(start, end)) continue;

    const sounding = score.notes.filter((n) => isSounding(n, start, end));
    const pitches = sounding.map((n) => n.pitch);
    const match = detectChord(pitches);
    if (!match) continue;

    windows.push({
      start,
      end,
      data: match.data,
      confidence: match.confidence,
      noteIds: sounding.map((n) => n.id),
    });
  }

  // Coalesce consecutive windows resolving to the same symbol.
  const annotations: Annotation[] = [];
  for (const w of windows) {
    const prev = annotations[annotations.length - 1] as
      | (Annotation<"chord", ChordData> & { confidence: number })
      | undefined;
    if (
      prev &&
      prev.data.symbol === w.data.symbol &&
      Math.abs(prev.end - w.start) < 1e-6
    ) {
      // Extend the previous annotation to cover this window.
      prev.end = w.end;
      const ids = new Set([...(prev.target?.noteIds ?? []), ...w.noteIds]);
      prev.target = { noteIds: Array.from(ids) };
      prev.confidence = Math.max(prev.confidence, w.confidence);
      continue;
    }
    annotations.push({
      type: "chord",
      start: w.start,
      end: w.end,
      target: { noteIds: w.noteIds },
      data: w.data,
      source: "derived",
      confidence: w.confidence,
    } satisfies Annotation<"chord", ChordData>);
  }

  return annotations;
}
