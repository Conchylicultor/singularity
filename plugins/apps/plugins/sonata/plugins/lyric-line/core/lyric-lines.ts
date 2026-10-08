import type {
  LyricAnnotation,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

const EPS = 1e-6;

/** Identity of the chord sounding now among the lyric lines: which line, and
 *  which of that line's `chords`. Compared by value ({@link sameActiveChord}). */
export interface ActiveChord {
  /** Index of the line in the list the chord was looked up in. */
  line: number;
  /** Index of the chord within that line's `chords`. */
  chord: number;
}

/** The score's songsheet lines (its `lyric` annotations), sorted by start. */
export function lyricLines(score: Score): LyricAnnotation[] {
  return score.annotations
    .filter((a): a is LyricAnnotation => a.type === "lyric")
    .sort((a, b) => a.start - b.start);
}

/**
 * The lyric chord sounding at `beat`: the chord printed over the lines whose
 * `beat` is the greatest at or before `beat` (a later line wins a tie, so a
 * chord repeated at the head of the next line takes over). `null` before the
 * first chord.
 */
export function activeLyricChord(
  lines: readonly LyricAnnotation[],
  beat: number,
): ActiveChord | null {
  let best: ActiveChord | null = null;
  let bestBeat = -Infinity;
  lines.forEach((l, li) => {
    l.data.chords.forEach((c, ci) => {
      if (c.beat <= beat + EPS && c.beat >= bestBeat) {
        bestBeat = c.beat;
        best = { line: li, chord: ci };
      }
    });
  });
  return best;
}

/** Value equality for {@link ActiveChord}, for a cursor selector's `equals`. */
export function sameActiveChord(
  a: ActiveChord | null,
  b: ActiveChord | null,
): boolean {
  return a?.line === b?.line && a?.chord === b?.chord;
}
