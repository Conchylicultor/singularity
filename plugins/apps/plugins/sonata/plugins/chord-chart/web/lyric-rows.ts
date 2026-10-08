import type {
  ChordBar,
  LyricAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/** Most bars a row of the chord grid holds. */
export const BARS_PER_ROW = 4;

const EPS = 1e-6;

/** A songsheet line and its index in the list handed to {@link lyricRows}. */
export interface RowLyric {
  line: LyricAnnotation;
  index: number;
}

/** One row of the grid: its bars, and the lyric lines printed under it. */
export interface LyricRow<T> {
  bars: T[];
  /** The lines starting in this row's first bar, in order (empty for a row
   *  that carries on a line from the row before, or precedes any line). */
  lines: RowLyric[];
}

/**
 * Lay each section group's bars out in rows, a row per lyric line. A line
 * belongs to the last bar starting at or before it (a pickup before the first
 * bar goes to the first; lines past the last bar to the last). A row breaks
 * before every bar a line belongs to, so each line starts a row at its first
 * column and has the row's whole width; a row also breaks after
 * {@link BARS_PER_ROW} bars, so a long line wraps its remaining bars into rows
 * of their own, and bars before a group's first line chunk by four. Lines
 * belonging to one bar share its row. Without lines this is plain chunking by
 * four. `groups` are the grid's section groups in reading order, each a run of
 * items carrying their `bar`; `lines` are sorted by start. Returns each
 * group's rows, in order.
 */
export function lyricRows<T extends { bar: ChordBar }>(
  groups: readonly (readonly T[])[],
  lines: readonly LyricAnnotation[],
): LyricRow<T>[][] {
  // Each line under its bar, by the bar's position in reading order.
  const flat = groups.flat();
  const byBar = new Map<number, RowLyric[]>();
  if (flat.length > 0) {
    let b = 0;
    lines.forEach((line, index) => {
      while (
        b + 1 < flat.length &&
        flat[b + 1]!.bar.startBeat <= line.start + EPS
      )
        b++;
      const at = byBar.get(b) ?? [];
      at.push({ line, index });
      byBar.set(b, at);
    });
  }

  let pos = 0;
  return groups.map((group) => {
    const rows: LyricRow<T>[] = [];
    for (const item of group) {
      const own = byBar.get(pos++);
      const last = rows.at(-1);
      if (own === undefined && last && last.bars.length < BARS_PER_ROW) {
        last.bars.push(item);
      } else {
        rows.push({ bars: [item], lines: own ?? [] });
      }
    }
    return rows;
  });
}
