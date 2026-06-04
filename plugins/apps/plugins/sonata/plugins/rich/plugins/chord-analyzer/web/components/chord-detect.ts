/**
 * Pure chord detection from a set of pitch-classes.
 *
 * Recognises the following qualities (interval-set matching, root-invariant):
 *
 *   Triads     : maj · min · aug · dim
 *   7th chords : dom7 (7) · maj7 (M7) · min7 (m7) · minmaj7 (mM7)
 *                · dim7 · halfdim7 (ø7) · aug7 (#5,7) · augmaj7 (#5,M7)
 *
 * Strategy:
 *   1. Collect the pitch-classes sounding in the window (mod-12, deduped).
 *   2. For every possible root (0–11) build the interval set relative to that
 *      root.
 *   3. Match against the interval-set table; keep the best match (most
 *      intervals explained by the template), breaking ties by preferring larger
 *      templates (7ths over triads) and then lower root.
 *   4. Confidence = matched / total sounding PCs (how much the template covers).
 */

import type { ChordData } from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  CHORD_TEMPLATES,
  PC_NAMES,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";

// The chord vocabulary (templates + pitch-class names) lives in `theory/core`
// so the analyzer (notes → chord) and chord-authoring sources (chord → notes)
// share exactly one table. `CHORD_TEMPLATES` is already ordered most-specific
// (7ths) first, which the detection tie-break below relies on.

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
    const intervals = new Set(pcs.map((pc) => ((pc - root + 12) % 12)));

    for (const tmpl of CHORD_TEMPLATES) {
      // Count how many template intervals are present in the sounding set.
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
