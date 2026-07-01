import { describe, expect, test } from "bun:test";
import type {
  ChordAnnotation,
  Note,
  Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  convert,
  vexflowKeyName,
  type ConvertOptions,
  type EngMeasure,
  type EngTickable,
} from "./convert";
import { decomposeDuration } from "./durations";

let nextId = 0;
function note(
  pitch: number,
  start: number,
  duration: number,
  track = "t0",
): Note {
  return {
    id: `n${nextId++}`,
    pitch,
    start,
    duration,
    velocity: 80,
    track,
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

const OPTS: ConvertOptions = {
  splitPitch: 60,
  showChordSymbols: true,
  staffLayout: "auto",
  separateVoices: true,
};

/** Flatten every voice's tickables on the first staff with the given clef. */
function clefTickables(m: EngMeasure, clef: "treble" | "bass"): EngTickable[] {
  const staff = m.staves.find((s) => s.clef === clef);
  return staff ? staff.voices.flatMap((v) => v.tickables) : [];
}

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
    const treble = clefTickables(bar, "treble");
    expect(treble.length).toBe(4);
    expect(treble.every((t) => !t.isRest)).toBe(true);
    expect(treble.map((t) => t.duration)).toEqual(["q", "q", "q", "q"]);
    expect(treble.map((t) => t.keys[0])).toEqual(["c/4", "d/4", "e/4", "f/4"]);
    // No bass notes → the bass staff is one bar-filling rest.
    expect(clefTickables(bar, "bass").every((t) => t.isRest)).toBe(true);
  });

  test("three simultaneous notes collapse into one chord tickable", () => {
    const s = score([note(60, 0, 4), note(64, 0, 4), note(67, 0, 4)]);
    const bar = convert(s, OPTS).measures[0]!;
    const treble = clefTickables(bar, "treble");
    expect(treble.length).toBe(1);
    const chord = treble[0]!;
    expect(chord.keys).toEqual(["c/4", "e/4", "g/4"]);
    expect(chord.duration).toBe("w");
    expect(chord.isRest).toBe(false);
  });

  test("a mid-bar gap produces a rest", () => {
    // Quarter at beat 0, silence on beat 1, quarter at beat 2, quarter at beat 3.
    const s = score([note(60, 0, 1), note(64, 2, 1), note(65, 3, 1)]);
    const bar = convert(s, OPTS).measures[0]!;
    const treble = clefTickables(bar, "treble");
    const kinds = treble.map((t) => (t.isRest ? "rest" : "note"));
    expect(kinds).toEqual(["note", "rest", "note", "note"]);
    expect(treble[1]!.duration).toBe("q");
  });

  test("half + quarter + quarter", () => {
    const s = score([note(60, 0, 2), note(62, 2, 1), note(64, 3, 1)]);
    const bar = convert(s, OPTS).measures[0]!;
    expect(clefTickables(bar, "treble").map((t) => t.duration)).toEqual([
      "h",
      "q",
      "q",
    ]);
  });

  test("a note crossing the barline produces a tie", () => {
    // Note from beat 3 to beat 5: a quarter in bar 0 tied to a quarter in bar 1.
    const s = score([note(60, 3, 2)]);
    const m = convert(s, OPTS);
    expect(m.measures.length).toBe(2);
    const last0 = clefTickables(m.measures[0]!, "treble").at(-1)!;
    expect(last0.isRest).toBe(false);
    expect(last0.tieToNext).toBe(true);
    // Bar 1 restates the note (the continuation), then rests out the bar.
    const first1 = clefTickables(m.measures[1]!, "treble").find((t) => !t.isRest)!;
    expect(first1.keys[0]).toBe("c/4");
    expect(first1.beat).toBe(4);
  });

  test("treble / bass split by pitch (grand staff)", () => {
    const s = score([note(72, 0, 4), note(48, 0, 4)]);
    const bar = convert(s, OPTS).measures[0]!;
    expect(
      clefTickables(bar, "treble").some((t) => !t.isRest && t.keys.includes("c/5")),
    ).toBe(true);
    expect(
      clefTickables(bar, "bass").some((t) => !t.isRest && t.keys.includes("c/3")),
    ).toBe(true);
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
    const treble = clefTickables(m.measures[0]!, "treble");
    expect(treble.length).toBe(1);
    expect(treble[0]!.duration).toBe("q");
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

  // --- New: parts, voices, no re-articulation. ---

  test("grand layout merges all tracks onto one part / two staves", () => {
    const s = score([note(72, 0, 4, "t0"), note(48, 0, 4, "t1")], {
      tracks: [{ id: "t0" }, { id: "t1" }],
    });
    const model = convert(s, { ...OPTS, staffLayout: "grand" });
    expect(model.parts.length).toBe(1);
    expect(model.parts[0]!.id).toBe("_grand");
    expect(model.parts[0]!.staffCount).toBe(2);
    expect(model.measures[0]!.staves.length).toBe(2);
  });

  test("perTrack layout gives one part per track, ordered by pitch", () => {
    const s = score([note(72, 0, 4, "t0"), note(48, 0, 4, "t1")], {
      tracks: [{ id: "t0", name: "Flute" }, { id: "t1", name: "Cello" }],
    });
    const model = convert(s, {
      ...OPTS,
      staffLayout: "perTrack",
      tracks: [
        { id: "t0", name: "Flute" },
        { id: "t1", name: "Cello" },
      ],
    });
    expect(model.parts.length).toBe(2);
    // Higher-pitched track first.
    expect(model.parts.map((p) => p.id)).toEqual(["t0", "t1"]);
    expect(model.parts.map((p) => p.name)).toEqual(["Flute", "Cello"]);
    // Each single-staff part: t0 treble, t1 bass.
    expect(model.measures[0]!.staves.map((st) => st.clef)).toEqual([
      "treble",
      "bass",
    ]);
  });

  test("auto groups two same-gmProgram tracks into ONE grand-staff part", () => {
    // Solo piano imported as left/right-hand tracks sharing one GM program.
    const s = score([note(72, 0, 4, "t0"), note(48, 0, 4, "t1")], {
      tracks: [
        { id: "t0", gmProgram: 0 },
        { id: "t1", gmProgram: 0 },
      ],
    });
    const model = convert(s, {
      ...OPTS,
      staffLayout: "auto",
      tracks: [
        { id: "t0", gmProgram: 0 },
        { id: "t1", gmProgram: 0 },
      ],
    });
    // ONE part (not two), rendered as a grand staff (treble + bass).
    expect(model.parts.length).toBe(1);
    expect(model.parts[0]!.staffCount).toBe(2);
    expect(model.measures[0]!.staves.length).toBe(2);
    expect(model.measures[0]!.staves.map((st) => st.clef)).toEqual([
      "treble",
      "bass",
    ]);
  });

  test("auto keeps two distinct-instrument tracks as two parts", () => {
    const s = score([note(72, 0, 4, "t0"), note(48, 0, 4, "t1")], {
      tracks: [
        { id: "t0", name: "Flute", gmProgram: 73 },
        { id: "t1", name: "Cello", gmProgram: 42 },
      ],
    });
    const model = convert(s, {
      ...OPTS,
      staffLayout: "auto",
      tracks: [
        { id: "t0", name: "Flute", gmProgram: 73 },
        { id: "t1", name: "Cello", gmProgram: 42 },
      ],
    });
    expect(model.parts.length).toBe(2);
    expect(model.parts.map((p) => p.name)).toEqual(["Flute", "Cello"]);
  });

  test("auto keeps unknown-instrument tracks separate (no wrong merge)", () => {
    // Neither track carries instrument info → each is its own group.
    const s = score([note(72, 0, 4, "t0"), note(48, 0, 4, "t1")], {
      tracks: [{ id: "t0" }, { id: "t1" }],
    });
    const model = convert(s, {
      ...OPTS,
      staffLayout: "auto",
      tracks: [{ id: "t0" }, { id: "t1" }],
    });
    expect(model.parts.length).toBe(2);
  });

  test("perTrack gives one part per track even at same instrument", () => {
    // Same GM program, but perTrack must NOT merge — strictly one part per track.
    const s = score([note(72, 0, 4, "t0"), note(48, 0, 4, "t1")], {
      tracks: [
        { id: "t0", gmProgram: 0 },
        { id: "t1", gmProgram: 0 },
      ],
    });
    const model = convert(s, {
      ...OPTS,
      staffLayout: "perTrack",
      tracks: [
        { id: "t0", gmProgram: 0 },
        { id: "t1", gmProgram: 0 },
      ],
    });
    expect(model.parts.length).toBe(2);
    expect(model.parts.map((p) => p.id)).toEqual(["t0", "t1"]);
  });

  test("a held note under a moving line is NOT re-articulated", () => {
    // Held C4 across the bar, with a stepwise upper line moving over it.
    const s = score([
      note(60, 0, 4),
      note(67, 0, 1),
      note(65, 1, 1),
      note(64, 2, 1),
      note(62, 3, 1),
    ]);
    const staff = convert(s, OPTS).measures[0]!.staves.find(
      (st) => st.clef === "treble",
    )!;
    expect(staff.voices.length).toBe(2);
    // The held voice is a single whole-note tickable — no re-strike.
    const held = staff.voices.find(
      (v) => v.tickables.length === 1 && v.tickables[0]!.keys[0] === "c/4",
    );
    expect(held).toBeDefined();
    expect(held!.tickables[0]!.duration).toBe("w");
    expect(held!.tickables[0]!.tieToNext).toBe(false);
    // The moving voice has four quarter tickables.
    const moving = staff.voices.find((v) => v.tickables.length === 4)!;
    expect(moving.tickables.every((t) => !t.isRest)).toBe(true);
  });

  test("a 2-voice staff opposes stems up / down", () => {
    const s = score([
      note(60, 0, 4),
      note(67, 0, 1),
      note(65, 1, 1),
      note(64, 2, 1),
      note(62, 3, 1),
    ]);
    const staff = convert(s, OPTS).measures[0]!.staves.find(
      (st) => st.clef === "treble",
    )!;
    const stems = staff.voices.map((v) => v.stem).sort();
    expect(stems).toEqual(["down", "up"]);
    // The upper (moving) voice points up; the held lower voice points down.
    const upper = staff.voices.find((v) => v.stem === "up")!;
    const lower = staff.voices.find((v) => v.stem === "down")!;
    expect(upper.tickables.length).toBe(4);
    expect(lower.tickables[0]!.keys[0]).toBe("c/4");
  });

  test("separateVoices=false reproduces the single-voice-per-staff look", () => {
    const s = score([
      note(60, 0, 4),
      note(67, 0, 1),
      note(65, 1, 1),
      note(64, 2, 1),
      note(62, 3, 1),
    ]);
    const staff = convert(s, { ...OPTS, separateVoices: false }).measures[0]!.staves.find(
      (st) => st.clef === "treble",
    )!;
    expect(staff.voices.length).toBe(1);
    expect(staff.voices[0]!.stem).toBe("auto");
  });
});
