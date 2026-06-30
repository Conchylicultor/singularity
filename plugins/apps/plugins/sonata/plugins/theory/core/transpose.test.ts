import { describe, expect, it } from "bun:test";
import {
  emptyScore,
  makeKeySpeller,
  type Annotation,
  type ChordData,
  type LyricData,
  type Note,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { transposeChordText, transposeKey, transposeScore } from "./transpose";

function note(pitch: number): Note {
  return {
    id: `n${pitch}`,
    pitch,
    start: 0,
    duration: 1,
    velocity: 80,
    track: "t0",
  };
}

function chordAnn(data: ChordData, start = 0): Annotation {
  return { type: "chord", start, end: start + 4, data, source: "authored" };
}

describe("transposeKey", () => {
  it("renames C → D at +2 (major)", () => {
    expect(transposeKey({ tonic: "C", mode: "major" }, 2)).toEqual({
      tonic: "D",
      mode: "major",
    });
  });

  it("chooses sensible flats", () => {
    // pc 1 reads Db major (fewest accidentals), not C#.
    expect(transposeKey({ tonic: "C", mode: "major" }, 1)).toEqual({
      tonic: "Db",
      mode: "major",
    });
    expect(transposeKey({ tonic: "F", mode: "major" }, -2)).toEqual({
      tonic: "Eb",
      mode: "major",
    });
  });

  it("preserves the mode and wraps mod-12", () => {
    expect(transposeKey({ tonic: "A", mode: "minor" }, 3)).toEqual({
      tonic: "C",
      mode: "minor",
    });
    expect(transposeKey({ tonic: "B", mode: "major" }, 1)).toEqual({
      tonic: "C",
      mode: "major",
    });
  });
});

describe("transposeChordText", () => {
  // D-major speller: A and C# are diatonic, so enharmonics read key-correct.
  const speller = makeKeySpeller({ tonic: "D", mode: "major" });

  it("shifts a plain chord root", () => {
    expect(transposeChordText("C", 2, speller)).toBe("D");
  });

  it("shifts a slash chord's root and bass", () => {
    expect(transposeChordText("G/B", 2, speller)).toBe("A/C♯");
  });

  it("preserves an extended suffix verbatim", () => {
    expect(transposeChordText("Cadd9", 2, speller)).toBe("Dadd9");
    expect(transposeChordText("Cmaj7", 2, speller)).toBe("Dmaj7");
  });

  it("returns unrecognised tokens unchanged", () => {
    expect(transposeChordText("N.C.", 2, speller)).toBe("N.C.");
    expect(transposeChordText("%", 2, speller)).toBe("%");
  });
});

describe("transposeScore", () => {
  it("is an identity (same reference) when semitones === 0", () => {
    const score: Score = { ...emptyScore(), notes: [note(60)] };
    expect(transposeScore(score, 0)).toBe(score);
  });

  it("shifts every note's pitch and clears its spelling", () => {
    const score: Score = {
      ...emptyScore(),
      notes: [
        {
          ...note(60),
          spelling: { step: "C", alter: 0, octave: 4 },
        },
      ],
    };
    const out = transposeScore(score, 2);
    expect(out.notes[0]!.pitch).toBe(62);
    expect(out.notes[0]!.spelling).toBeUndefined();
    // Pure: input untouched.
    expect(score.notes[0]!.pitch).toBe(60);
  });

  it("renames meta.key", () => {
    const score: Score = {
      ...emptyScore(),
      meta: { key: { tonic: "C", mode: "major" } },
      notes: [note(60)],
    };
    expect(transposeScore(score, 2).meta.key).toEqual({
      tonic: "D",
      mode: "major",
    });
  });

  it("shifts chord-annotation root/bass and regenerates symbol + spelledSymbol", () => {
    const score: Score = {
      ...emptyScore(),
      meta: { key: { tonic: "C", mode: "major" } },
      notes: [note(60)],
      annotations: [
        chordAnn({ symbol: "G/B", root: 7, quality: "maj", bass: 11 }),
      ],
    };
    const out = transposeScore(score, 2);
    const data = out.annotations[0]!.data as ChordData;
    expect(data.root).toBe(9); // G → A
    expect(data.bass).toBe(1); // B → C#
    expect(data.symbol).toBe("A/C#"); // normalized sharps
    expect(data.spelledSymbol).toBe("A/C♯"); // key-aware (D major)
  });

  it("transposes authored lyric chord text", () => {
    const lyric: LyricData = {
      text: "hello",
      chords: [
        { symbol: "C", charOffset: 0, beat: 0 },
        { symbol: "G/B", charOffset: 2, beat: 1 },
        { symbol: "N.C.", charOffset: 4, beat: 2 },
      ],
    };
    const score: Score = {
      ...emptyScore(),
      meta: { key: { tonic: "C", mode: "major" } },
      notes: [note(60)],
      annotations: [{ type: "lyric", start: 0, end: 4, data: lyric, source: "authored" }],
    };
    const out = transposeScore(score, 2);
    const data = out.annotations[0]!.data as LyricData;
    expect(data.chords.map((c) => c.symbol)).toEqual(["D", "A/C♯", "N.C."]);
  });
});
