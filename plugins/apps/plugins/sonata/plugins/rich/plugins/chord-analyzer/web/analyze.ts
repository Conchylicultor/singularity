/**
 * The chord Analyzer: pure `(Score) => Annotation[]`.
 *
 * Thin mapper over the shared `detectChordWindows` primitive (in `theory/core`):
 * it segments the score into chord windows and shapes each into a `chord`
 * annotation. Every emitted annotation is `source: "derived"` — analyzers never
 * author truth, so `mergeAnnotations` keeps them strictly additive.
 *
 * When a chord-authoring source (e.g. the chord grid) is part of the score, its
 * chords are present as `source:"authored"` annotations with backing voiced
 * notes. Re-deriving chords over those notes would double-render in the overlay,
 * so detection skips any window already covered by an authored chord (via
 * `skipSpans`) — leaving authored truth as the sole label there, while still
 * analysing note-only regions (e.g. a merged MIDI track) that have no authored
 * coverage.
 */

import type {
  Annotation,
  ChordData,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { detectChordWindows } from "@plugins/apps/plugins/sonata/plugins/theory/core";

export function analyze(score: Score): Annotation[] {
  // Spans already labelled by an authored chord — detection skips windows that
  // overlap these so authored truth is never duplicated by a derived chord.
  const authoredSpans = score.annotations
    .filter((a) => a.type === "chord" && a.source === "authored")
    .map((a) => ({ start: a.start, end: a.end }));

  return detectChordWindows(score, { skipSpans: authoredSpans }).map(
    (w) =>
      ({
        type: "chord",
        start: w.start,
        end: w.end,
        target: { noteIds: w.noteIds },
        data: w.data,
        source: "derived",
        confidence: w.confidence,
      }) satisfies Annotation<"chord", ChordData>,
  );
}
