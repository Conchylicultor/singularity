import { describe, expect, it } from "bun:test";
import { bpmAtBeat, emptyScore, scaleTempo } from "./helpers";
import type { Score, TempoEvent } from "./types";

function scoreWith(tempoMap: TempoEvent[]): Score {
  return { ...emptyScore(), tempoMap };
}

describe("bpmAtBeat", () => {
  it("reads the 120-BPM default for a score with no tempo map", () => {
    expect(bpmAtBeat(scoreWith([]), 3)).toBeCloseTo(120, 3);
  });

  it("follows tempo changes within the song", () => {
    const score = scoreWith([
      { beat: 0, bpm: 90 },
      { beat: 8, bpm: 140 },
    ]);
    expect(bpmAtBeat(score, 2)).toBeCloseTo(90, 3);
    expect(bpmAtBeat(score, 10)).toBeCloseTo(140, 3);
  });

  it("is the live BPM on a score with a playback speed folded in", () => {
    const score = scaleTempo(scoreWith([{ beat: 0, bpm: 100 }]), 0.5);
    expect(bpmAtBeat(score, 4)).toBeCloseTo(50, 3);
  });
});
