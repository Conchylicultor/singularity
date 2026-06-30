import { describe, expect, test } from "bun:test";
import type {
  ChordAnnotation,
  Note,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { convert, vexflowKeyName } from "./convert";
import { decomposeDuration } from "./durations";

let nextId = 0;
function note(pitch: number, start: number, duration: number): Note {
  return {
    id: `n${nextId++}`,
    pitch,
    start,
    duration,
    velocity: 80,
    track: "t0",
  };
}

function score(notes: Note[], extra?: Partial<Score>): Score {
  return {
    meta: {},
    tracks: [{ id: "t0" }],
    tempoMap: [],
    timeSigMap: [],
    notes,
    annotations: [],
    ...extra,
  };
}

const OPTS = { splitPitch: 60, showChordSymbols: true };

describe("decomposeDuration", () => {
  test("a quarter is one piece", () => {
    expect(decomposeDuration(1.0)).toEqual([{ duration: "q", dots: 0, beats: 1 }]);
  });

  test("1.5 beats is a single dotted quarter (not two tied pieces)", () => {
    expect(decomposeDuration(1.5)).toEqual([{ duration: "q", dots: 1, beats: 1.5 }]);
  });

  test("1.25 beats is a quarter tied to a sixteenth", () => {
    expect(decomposeDuration(1.25)).toEqual([
      { duration: "q", dots: 0, beats: 1 },
      { duration: "16", dots: 0, beats: 0.25 },
    ]);
  });

  test("a whole note", () => {
    expect(decomposeDuration(4.0)).toEqual([{ duration: "w", dots: 0, beats: 4 }]);
  });

  test("non-positive length yields no pieces", () => {
    expect(decomposeDuration(0)).toEqual([]);
    expect(decomposeDuration(-1)).toEqual([]);
  });
});

describe("vexflowKeyName", () => {
  test("major / minor / unicode normalization / fallback", () => {
    expect(vexflowKeyName({ tonic: "C", mode: "major" })).toBe("C");
    expect(vexflowKeyName({ tonic: "A", mode: "minor" })).toBe("Am");
    expect(vexflowKeyName({ tonic: "B♭", mode: "major" })).toBe("Bb");
    expect(vexflowKeyName({ tonic: "F♯", mode: "minor" })).toBe("F#m");
    expect(vexflowKeyName(undefined)).toBe("C");
    // A tonic VexFlow has no signature for falls back to C rather than throwing.
    expect(vexflowKeyName({ tonic: "G#", mode: "major" })).toBe("C");
  });
});

describe("convert", () => {
  test("a 4/4 bar of four quarter notes → four treble tickables", () => {
    const s = score([
      note(60, 0, 1),
      note(62, 1, 1),
      note(64, 2, 1),
      note(65, 3, 1),
    ]);
    const m = convert(s, OPTS);
    expect(m.measures.length).toBe(1);
    const bar = m.measures[0]!;
    expect(bar.timeSig).toEqual({ numerator: 4, denominator: 4 });
    expect(bar.treble.length).toBe(4);
    expect(bar.treble.every((t) => !t.isRest)).toBe(true);
    expect(bar.treble.map((t) => t.duration)).toEqual(["q", "q", "q", "q"]);
    expect(bar.treble.map((t) => t.keys[0])).toEqual([
      "c/4",
      "d/4",
      "e/4",
      "f/4",
    ]);
    // No bass notes → the bass staff is one bar-filling rest.
    expect(bar.bass.every((t) => t.isRest)).toBe(true);
  });

  test("three simultaneous notes collapse into one chord tickable", () => {
    const s = score([note(60, 0, 4), note(64, 0, 4), note(67, 0, 4)]);
    const bar = convert(s, OPTS).measures[0]!;
    expect(bar.treble.length).toBe(1);
    const chord = bar.treble[0]!;
    expect(chord.keys).toEqual(["c/4", "e/4", "g/4"]);
    expect(chord.duration).toBe("w");
    expect(chord.isRest).toBe(false);
  });

  test("a mid-bar gap produces a rest", () => {
    // Quarter at beat 0, silence on beat 1, quarter at beat 2, quarter at beat 3.
    const s = score([note(60, 0, 1), note(64, 2, 1), note(65, 3, 1)]);
    const bar = convert(s, OPTS).measures[0]!;
    const kinds = bar.treble.map((t) => (t.isRest ? "rest" : "note"));
    expect(kinds).toEqual(["note", "rest", "note", "note"]);
    const rest = bar.treble[1]!;
    expect(rest.duration).toBe("q");
  });

  test("half + quarter + quarter", () => {
    const s = score([note(60, 0, 2), note(62, 2, 1), note(64, 3, 1)]);
    const bar = convert(s, OPTS).measures[0]!;
    expect(bar.treble.map((t) => t.duration)).toEqual(["h", "q", "q"]);
  });

  test("a note crossing the barline produces a tie", () => {
    // Note from beat 3 to beat 5: a quarter in bar 0 tied to a quarter in bar 1.
    const s = score([note(60, 3, 2)]);
    const m = convert(s, OPTS);
    expect(m.measures.length).toBe(2);
    const last0 = m.measures[0]!.treble.at(-1)!;
    expect(last0.isRest).toBe(false);
    expect(last0.tieToNext).toBe(true);
    // Bar 1 restates the note (the continuation), then rests out the bar.
    const first1 = m.measures[1]!.treble.find((t) => !t.isRest)!;
    expect(first1.keys[0]).toBe("c/4");
    expect(first1.beat).toBe(4);
  });

  test("treble / bass split by pitch", () => {
    const s = score([note(72, 0, 4), note(48, 0, 4)]);
    const bar = convert(s, OPTS).measures[0]!;
    expect(bar.treble.some((t) => !t.isRest && t.keys.includes("c/5"))).toBe(true);
    expect(bar.bass.some((t) => !t.isRest && t.keys.includes("c/3"))).toBe(true);
  });

  test("pickup bar is a short first measure", () => {
    // 1-beat pickup, then a full 4/4 bar.
    const s = score([note(67, 0, 1), note(60, 1, 4)], {
      meta: { pickupBeats: 1 },
    });
    const m = convert(s, OPTS);
    // bars(): pickup bar [0,1) + full bar [1,5).
    expect(m.measures[0]!.startBeat).toBe(0);
    // The pickup bar holds a single quarter (its whole 1-beat length).
    expect(m.measures[0]!.treble.length).toBe(1);
    expect(m.measures[0]!.treble[0]!.duration).toBe("q");
  });

  test("chord symbols are attached to the measure they start in", () => {
    const chord: ChordAnnotation = {
      type: "chord",
      start: 0,
      end: 4,
      source: "authored",
      data: { symbol: "Cmaj7", root: 0, quality: "maj7" },
    };
    const s = score([note(60, 0, 4)], { annotations: [chord] });
    const bar = convert(s, OPTS).measures[0]!;
    expect(bar.chordSymbol).toBe("Cmaj7");
    // Disabled when showChordSymbols is false.
    const off = convert(s, { ...OPTS, showChordSymbols: false }).measures[0]!;
    expect(off.chordSymbol).toBeUndefined();
  });
});
