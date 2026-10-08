import { describe, expect, it } from "bun:test";
import type {
  ChordBar,
  LyricAnnotation,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { lyricRows } from "./lyric-rows";

/** `n` consecutive 4-beat bars from `startBeat`, numbered from `first`. */
function bars(n: number, startBeat = 0, first = 1): { bar: ChordBar }[] {
  return Array.from({ length: n }, (_, i) => ({
    bar: {
      number: first + i,
      startBeat: startBeat + 4 * i,
      endBeat: startBeat + 4 * (i + 1),
      segs: [],
    },
  }));
}

function line(start: number, end: number): LyricAnnotation {
  return {
    type: "lyric",
    start,
    end,
    data: { text: "", chords: [] },
    source: "authored",
  };
}

/** Each group's rows as `bar numbers | line indices`, for compact assertions. */
function shape(
  groups: { bar: ChordBar }[][],
  lines: LyricAnnotation[],
): string[][] {
  return lyricRows(groups, lines).map((rows) =>
    rows.map(
      (r) =>
        `${r.bars.map((b) => String(b.bar.number)).join(",")} | ${r.lines
          .map((l) => String(l.index))
          .join(",")}`,
    ),
  );
}

describe("lyricRows", () => {
  it("chunks by four without lines", () => {
    expect(shape([bars(6)], [])).toEqual([["1,2,3,4 | ", "5,6 | "]]);
  });

  it("starts a new row at every line, each line its row's own", () => {
    // Shallow's verse: lines at bars 1, 3, 6, 8.
    expect(
      shape([bars(9)], [line(0, 8), line(8, 20), line(20, 28), line(28, 36)]),
    ).toEqual([["1,2 | 0", "3,4,5 | 1", "6,7 | 2", "8,9 | 3"]]);
  });

  it("places a line by the bar it starts in, even off the downbeat", () => {
    expect(shape([bars(4)], [line(0, 6), line(6, 16)])).toEqual([
      ["1 | 0", "2,3,4 | 1"],
    ]);
  });

  it("wraps a line longer than four bars into rows without lines", () => {
    expect(shape([bars(10)], [line(0, 40)])).toEqual([
      ["1,2,3,4 | 0", "5,6,7,8 | ", "9,10 | "],
    ]);
  });

  it("chunks the bars before a group's first line by four", () => {
    expect(shape([bars(7)], [line(20, 28)])).toEqual([
      ["1,2,3,4 | ", "5 | ", "6,7 | 0"],
    ]);
  });

  it("puts two lines starting in one bar in its row", () => {
    expect(shape([bars(4)], [line(0, 2), line(2, 8), line(8, 16)])).toEqual([
      ["1,2 | 0,1", "3,4 | 2"],
    ]);
  });

  it("gives a pickup before the first bar to the first row", () => {
    expect(shape([bars(4)], [line(-2, 4), line(4, 16)])).toEqual([
      ["1 | 0", "2,3,4 | 1"],
    ]);
  });

  it("gives lyrics past the last bar to the last bar's row", () => {
    expect(shape([bars(4)], [line(4, 8), line(40, 48)])).toEqual([
      ["1 | ", "2,3 | 0", "4 | 1"],
    ]);
  });

  it("breaks rows per section group, placing lines across groups in order", () => {
    expect(shape([bars(2), bars(4, 8, 3)], [line(4, 8), line(8, 16)])).toEqual([
      ["1 | ", "2 | 0"],
      ["3,4,5,6 | 1"],
    ]);
  });

  it("has no rows without bars", () => {
    expect(lyricRows([], [line(0, 4)])).toEqual([]);
  });
});
