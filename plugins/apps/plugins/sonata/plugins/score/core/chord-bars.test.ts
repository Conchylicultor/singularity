import { describe, expect, it } from "bun:test";
import { chordBars } from "./chord-bars";
import { emptyScore } from "./helpers";
import type { ChordAnnotation, Score } from "./types";

/** A chord annotation over `[start, end)` beats. */
function chord(symbol: string, start: number, end: number): ChordAnnotation {
  return {
    type: "chord",
    start,
    end,
    data: { symbol, root: 0, quality: "maj" },
    source: "authored",
  };
}

/** A 4/4 score holding only the given chords. */
function scoreOf(...chords: ChordAnnotation[]): Score {
  return { ...emptyScore(), annotations: chords };
}

/** Each bar as `number: symbol×grow(~ if held)`, for compact assertions. */
function shape(score: Score): string[] {
  return chordBars(score).map(
    (b) =>
      `${String(b.number)}: ${b.segs
        .map(
          (s) =>
            `${s.chord.data.symbol}×${String(s.grow)}${s.isContinuation ? "~" : ""}`,
        )
        .join(" ")}`,
  );
}

describe("chordBars", () => {
  it("has no bars without chords", () => {
    expect(chordBars(scoreOf())).toEqual([]);
  });

  it("splits a bar between the chords grouped in it", () => {
    expect(shape(scoreOf(chord("E", 0, 2), chord("E6", 2, 4)))).toEqual([
      "1: E×2 E6×2",
    ]);
  });

  it("widens a chord held inside its bar", () => {
    expect(shape(scoreOf(chord("C", 0, 3), chord("D", 3, 4)))).toEqual([
      "1: C×3 D×1",
    ]);
  });

  it("carries a chord held over the barline as a continuation", () => {
    expect(shape(scoreOf(chord("Cmaj7", 0, 12), chord("G", 12, 16)))).toEqual([
      "1: Cmaj7×4",
      "2: Cmaj7×4~",
      "3: Cmaj7×4~",
      "4: G×4",
    ]);
  });

  it("trims the empty bars at the head and tail, keeping bar numbers", () => {
    const bars = chordBars(scoreOf(chord("A", 8, 12)));
    expect(bars.map((b) => b.number)).toEqual([3]);
    expect(bars[0]!.startBeat).toBe(8);
    expect(bars[0]!.endBeat).toBe(12);
  });

  it("keeps a rest bar between chords", () => {
    expect(shape(scoreOf(chord("A", 0, 4), chord("B", 8, 12)))).toEqual([
      "1: A×4",
      "2: ",
      "3: B×4",
    ]);
  });

  it("hands back the score's own chord references", () => {
    const a = chord("A", 0, 4);
    expect(chordBars(scoreOf(a))[0]!.segs[0]!.chord).toBe(a);
  });
});
