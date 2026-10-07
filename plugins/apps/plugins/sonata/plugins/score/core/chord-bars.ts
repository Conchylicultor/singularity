import { bars, scoreEndBeat } from "./helpers";
import type { ChordAnnotation, Score } from "./types";

/** A chord's visible slice within one bar. */
export interface ChordBarSegment {
  /** The chord annotation — the score's own reference, so callers can match it by `===`. */
  chord: ChordAnnotation;
  /** Beats this slice spans inside the bar — its weight in a bar drawn to time. */
  grow: number;
  /** True when the chord was struck in an earlier bar and is held into this one. */
  isContinuation: boolean;
}

/** One bar of the chord progression: its slices plus the beat span it owns. */
export interface ChordBar {
  /** 1-based bar number in the full score (kept stable across head-trim). */
  number: number;
  startBeat: number;
  endBeat: number;
  segs: ChordBarSegment[];
}

const EPS = 1e-6;

/**
 * Slice every chord annotation against the score's bar grid. A chord occupies a
 * weighted slot in each bar it overlaps, so within-bar groups (`(E E6)`) split a
 * bar, in-bar holds (`(C . . D)`) widen the held chord, and cross-bar holds
 * (`Cmaj7 . .`) carry the chord forward as continuation slices. Source-agnostic:
 * reads the canonical Score, so authored chord-grids and analyzer-derived chords
 * slice identically. Empty (rest) bars at the head/tail are trimmed so the
 * result starts and ends on a chord; a score without chords has no bars.
 */
export function chordBars(score: Score): ChordBar[] {
  const chords = score.annotations.filter(
    (a): a is ChordAnnotation => a.type === "chord",
  );
  if (chords.length === 0) return [];
  const barList = bars(score);
  const end = scoreEndBeat(score);

  const lines: ChordBar[] = barList.map((b, i) => {
    const barStart = b.startBeat;
    const barEnd = barList[i + 1]?.startBeat ?? Math.max(end, barStart + 1);
    const segs: ChordBarSegment[] = [];
    for (const ch of chords) {
      if (ch.end <= barStart + EPS || ch.start >= barEnd - EPS) continue;
      const grow = Math.min(ch.end, barEnd) - Math.max(ch.start, barStart);
      if (grow <= EPS) continue;
      segs.push({ chord: ch, grow, isContinuation: ch.start < barStart - EPS });
    }
    segs.sort((a, z) => a.chord.start - z.chord.start);
    return { number: b.index + 1, startBeat: barStart, endBeat: barEnd, segs };
  });

  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi && lines[lo]!.segs.length === 0) lo++;
  while (hi >= lo && lines[hi]!.segs.length === 0) hi--;
  return lines.slice(lo, hi + 1);
}
