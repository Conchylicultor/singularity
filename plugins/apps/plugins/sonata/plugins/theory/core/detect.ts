/**
 * Pure "notes → chord" detection, the single home for it.
 *
 * Two layers:
 *  - `detectChord` recognises a chord from a set of sounding pitches
 *    (interval-set matching, root-invariant).
 *  - `detectChordWindows` segments a whole `Score` into chord windows: slice at
 *    every onset/offset, detect the chord per window, coalesce consecutive
 *    same-symbol windows. The chord analyzer consumes it; keeping the
 *    segmentation here gives "notes → chord" reasoning a single home next to the
 *    chord vocabulary, so any future consumer reuses it rather than re-deriving.
 *
 * Imports only `score/core` + the sibling chord vocabulary, keeping the DAG
 * acyclic.
 */

import type {
  ChordData,
  Note,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { CHORD_TEMPLATES, PC_NAMES } from "./chords";

/** Result of chord detection, or `null` if no template matches. */
export interface ChordMatch {
  data: ChordData;
  /** [0,1] fraction of sounding pitch-classes explained by the template. */
  confidence: number;
}

/**
 * Detect the best-fitting chord from a collection of MIDI pitch numbers.
 * Returns `null` when fewer than 2 distinct pitch-classes are present.
 *
 * Strategy: collect distinct pitch-classes (mod-12), and for every possible
 * root build the interval set relative to that root, then match against the
 * interval-set table — keeping the best match (most intervals explained,
 * breaking ties by preferring larger templates as `CHORD_TEMPLATES` is ordered
 * most-specific first, then lower root). Confidence = matched / total PCs.
 *
 * @param pitches - MIDI note numbers (any octave; duplicates are fine).
 */
export function detectChord(pitches: ReadonlyArray<number>): ChordMatch | null {
  // Collect distinct pitch-classes.
  const pcSet = new Set(pitches.map((p) => ((p % 12) + 12) % 12));
  const pcs = Array.from(pcSet);

  if (pcs.length < 2) return null;

  let best: ChordMatch | null = null;
  let bestScore = -1;

  for (let root = 0; root < 12; root++) {
    // Build a set of intervals relative to this root.
    const intervals = new Set(pcs.map((pc) => (pc - root + 12) % 12));

    for (const tmpl of CHORD_TEMPLATES) {
      // The root (interval 0) is always implicitly required.
      if (!intervals.has(0)) continue; // root must be sounding

      const matched = tmpl.intervals.filter((i) => intervals.has(i)).length;
      // All template intervals must be present (strict subset match).
      if (matched < tmpl.intervals.length) continue;

      // Score: number of template intervals matched (including root = +1).
      const score = matched + 1; // +1 for root
      if (score > bestScore) {
        bestScore = score;
        const rootName = PC_NAMES[root]!;
        best = {
          data: {
            symbol: rootName + tmpl.symbol,
            root,
            quality: tmpl.quality,
          },
          confidence: score / pcs.length,
        };
      }
    }
  }

  return best;
}

/** A `[start, end)` beat span already covered by authored truth. */
interface Span {
  start: number;
  end: number;
}

/** A note is sounding in `[start, end)` when its span overlaps the window. */
function isSounding(n: Note, start: number, end: number): boolean {
  const noteEnd = n.start + n.duration;
  return n.start < end && noteEnd > start;
}

/** A detected chord over a beat span, plus the notes realizing it. */
export interface ChordWindow {
  start: number;
  end: number;
  data: ChordData;
  confidence: number;
  /** Ids of every note sounding across the window — the realizing notes. */
  noteIds: string[];
}

/**
 * Segment `score` at every distinct note onset/offset, detect the chord across
 * each window, and coalesce consecutive windows resolving to the same symbol
 * into one span (so the result isn't littered with repeated chords).
 *
 * `opts.skipSpans` excludes windows overlapping regions already covered by
 * authored truth — the chord analyzer passes authored chord spans so derived
 * chords never double-render over them.
 */
export function detectChordWindows(
  score: Score,
  opts?: { skipSpans?: ReadonlyArray<Span> },
): ChordWindow[] {
  if (score.notes.length === 0) return [];

  const skipSpans = opts?.skipSpans ?? [];
  const isSkipped = (start: number, end: number): boolean =>
    skipSpans.some((s) => start < s.end && end > s.start);

  // Window boundaries = every distinct onset, plus the final note-off, so each
  // window has a constant set of sounding pitches.
  const boundarySet = new Set<number>();
  for (const n of score.notes) {
    boundarySet.add(n.start);
    boundarySet.add(n.start + n.duration);
  }
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

  const windows: ChordWindow[] = [];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    if (end <= start) continue;
    if (isSkipped(start, end)) continue;

    const sounding = score.notes.filter((n) => isSounding(n, start, end));
    const pitches = sounding.map((n) => n.pitch);
    const match = detectChord(pitches);
    if (!match) continue;

    const prev = windows[windows.length - 1];
    if (
      prev &&
      prev.data.symbol === match.data.symbol &&
      Math.abs(prev.end - start) < 1e-6
    ) {
      // Coalesce: extend the previous window to cover this one.
      prev.end = end;
      const ids = new Set([...prev.noteIds, ...sounding.map((n) => n.id)]);
      prev.noteIds = Array.from(ids);
      prev.confidence = Math.max(prev.confidence, match.confidence);
      continue;
    }

    windows.push({
      start,
      end,
      data: match.data,
      confidence: match.confidence,
      noteIds: sounding.map((n) => n.id),
    });
  }

  return windows;
}
