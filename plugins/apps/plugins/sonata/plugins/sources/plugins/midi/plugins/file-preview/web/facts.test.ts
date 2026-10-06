import { describe, expect, it } from "bun:test";
import {
  emptyScore,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { formatBytes, midiFacts, pitchLabel } from "./facts";

function score(over: Partial<Score>): Score {
  return { ...emptyScore(), ...over };
}

describe("midiFacts", () => {
  it("reads tempo, meter, bars, tracks, notes, range and size", () => {
    const s = score({
      tracks: [{ id: "a" }, { id: "b" }],
      tempoMap: [{ beat: 0, bpm: 92.4 }],
      timeSigMap: [{ beat: 0, numerator: 3, denominator: 4 }],
      notes: [
        { id: "1", track: "a", pitch: 48, start: 0, duration: 3, velocity: 90 },
        { id: "2", track: "b", pitch: 79, start: 3, duration: 3, velocity: 90 },
      ],
    });
    expect(midiFacts(s, 12_595)).toEqual([
      { id: "bpm", value: "92", unit: "BPM" },
      { id: "meter", value: "3/4" },
      { id: "bars", value: "2", unit: "bars" },
      { id: "tracks", value: "2", unit: "tracks · 2 notes" },
      { id: "range", value: "C3–G5" },
      { id: "size", value: "12.3 KB" },
    ]);
  });

  it("defaults the meter to 4/4 and omits what an empty file lacks", () => {
    expect(midiFacts(score({}), 10).map((f) => f.id)).toEqual([
      "meter",
      "bars",
      "tracks",
      "size",
    ]);
  });
});

describe("labels", () => {
  it("names pitches with their octave", () => {
    expect(pitchLabel(60)).toBe("C4");
    expect(pitchLabel(61)).toBe("C♯4");
    expect(pitchLabel(21)).toBe("A0");
  });

  it("formats sizes", () => {
    expect(formatBytes(812)).toBe("812 B");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
  });
});
