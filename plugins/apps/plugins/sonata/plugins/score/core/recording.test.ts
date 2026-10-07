import { describe, expect, it } from "bun:test";
import { emptyScore, mergeScores, scaleTempo } from "./helpers";
import type { Score, ScoreRecording } from "./types";

const VIDEO: ScoreRecording = {
  provider: "youtube",
  videoId: "QDYfEBY9NM4",
  durationSec: 243,
};

function score(over: Partial<Score> & { meta?: Score["meta"] }): Score {
  return { ...emptyScore(), ...over };
}

describe("meta.recording", () => {
  it("mergeScores takes the recording from the score that supplied the tempo map", () => {
    const untimed = score({ meta: {} });
    const aligned = score({
      meta: { recording: VIDEO },
      tempoMap: [{ beat: 0, bpm: 71 }],
    });
    const merged = mergeScores([untimed, aligned]);
    expect(merged.tempoMap).toEqual([{ beat: 0, bpm: 71 }]);
    expect(merged.meta.recording).toEqual(VIDEO);
  });

  it("drops a recording whose tempo map lost to an earlier score's", () => {
    const first = score({ tempoMap: [{ beat: 0, bpm: 120 }] });
    const aligned = score({
      meta: { recording: VIDEO },
      tempoMap: [{ beat: 0, bpm: 71 }],
    });
    const merged = mergeScores([first, aligned]);
    expect(merged.tempoMap).toEqual([{ beat: 0, bpm: 120 }]);
    expect(merged.meta.recording).toBeUndefined();
  });

  it("scaleTempo keeps the recording", () => {
    const aligned = score({
      meta: { recording: VIDEO },
      tempoMap: [{ beat: 0, bpm: 100 }],
    });
    const scaled = scaleTempo(aligned, 0.5);
    expect(scaled.tempoMap).toEqual([{ beat: 0, bpm: 50 }]);
    expect(scaled.meta.recording).toEqual(VIDEO);
  });
});
