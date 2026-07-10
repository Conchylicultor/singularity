import { describe, expect, it } from "bun:test";
import { findVoicing, type ChordEvent, type VoicingOptions } from "./voicing";

/**
 * Voicing emission tests. The rhythm axis is orthogonal: with `opts.rhythm`
 * ABSENT every strategy must emit exactly today's notes (the no-regression
 * property), and with it PRESENT chords are struck on the bar-anchored onset
 * necklace passed in as absolute beats.
 *
 * Chord pitches are `chordPitches(data, octave)` = `[base, ...intervals]` where
 * `base = 12·(octave+1) + root` and a "maj" triad is `[4, 7]`. So at octave 4:
 *   C maj (root 0) → [60, 64, 67];  G maj (root 7) → [67, 71, 74].
 * These are the hardcoded expectations derived from the pitch model, not from
 * re-running the code under test.
 */

const OPTS: VoicingOptions = {
  octave: 4,
  track: "chords",
  idPrefix: "chord",
};

const cMaj = (start: number, end: number): ChordEvent => ({
  data: { symbol: "C", root: 0, quality: "maj" },
  start,
  end,
});
const gMaj = (start: number, end: number): ChordEvent => ({
  data: { symbol: "G", root: 7, quality: "maj" },
  start,
  end,
});

describe("block-full — no rhythm regression", () => {
  it("emits identical block notes to today's code on a 2-chord list", () => {
    const events = [cMaj(0, 4), gMaj(4, 8)];
    const notes = findVoicing("block-full").voice(events, OPTS);

    // Hardcoded expectation from reading today's block-full: one note per tone
    // per event, id `${idPrefix}-${i}-${k}`, start = ev.start, duration =
    // ev.end - ev.start, velocity 80, track "chords", voice undefined, no bass.
    expect(notes).toEqual([
      { id: "chord-0-0", pitch: 60, start: 0, duration: 4, velocity: 80, track: "chords", voice: undefined },
      { id: "chord-0-1", pitch: 64, start: 0, duration: 4, velocity: 80, track: "chords", voice: undefined },
      { id: "chord-0-2", pitch: 67, start: 0, duration: 4, velocity: 80, track: "chords", voice: undefined },
      { id: "chord-1-0", pitch: 67, start: 4, duration: 4, velocity: 80, track: "chords", voice: undefined },
      { id: "chord-1-1", pitch: 71, start: 4, duration: 4, velocity: 80, track: "chords", voice: undefined },
      { id: "chord-1-2", pitch: 74, start: 4, duration: 4, velocity: 80, track: "chords", voice: undefined },
    ]);
  });
});

describe("block-full — bar-anchored rhythm", () => {
  it("strikes each chord onset in the bar (onsets [0,2] over [0,4))", () => {
    const events = [cMaj(0, 4)];
    // A 4-subdivision bar over [0,4): onsets 0 and 2 resolve to beats 0 and 2.
    const notes = findVoicing("block-full").voice(events, {
      ...OPTS,
      rhythm: { bass: [], chord: [0, 2] },
    });

    // Two strikes (beats 0, 2), each the full triad, duration 2 (clipped to the
    // next onset). ids onset-indexed `-c${i}-${k}`; voice 1 (bass present).
    expect(notes).toEqual([
      { id: "chord-c0-0", pitch: 60, start: 0, duration: 2, velocity: 80, track: "chords", voice: 1 },
      { id: "chord-c0-1", pitch: 64, start: 0, duration: 2, velocity: 80, track: "chords", voice: 1 },
      { id: "chord-c0-2", pitch: 67, start: 0, duration: 2, velocity: 80, track: "chords", voice: 1 },
      { id: "chord-c1-0", pitch: 60, start: 2, duration: 2, velocity: 80, track: "chords", voice: 1 },
      { id: "chord-c1-1", pitch: 64, start: 2, duration: 2, velocity: 80, track: "chords", voice: 1 },
      { id: "chord-c1-2", pitch: 67, start: 2, duration: 2, velocity: 80, track: "chords", voice: 1 },
    ]);
  });

  it("a half-bar chord gets only the onsets falling in its half", () => {
    // Chord occupies only [2,4); the bar-anchored onsets are still 0 and 2.
    const events = [cMaj(2, 4)];
    const notes = findVoicing("block-full").voice(events, {
      ...OPTS,
      rhythm: { bass: [], chord: [0, 2] },
    });

    // Onset at beat 0 is silence (no chord in force) and skipped; only beat 2
    // strikes — and it keeps onset index 1, proving ids are onset-indexed.
    expect(notes).toEqual([
      { id: "chord-c1-0", pitch: 60, start: 2, duration: 2, velocity: 80, track: "chords", voice: 1 },
      { id: "chord-c1-1", pitch: 64, start: 2, duration: 2, velocity: 80, track: "chords", voice: 1 },
      { id: "chord-c1-2", pitch: 67, start: 2, duration: 2, velocity: 80, track: "chords", voice: 1 },
    ]);
  });
});

describe("bass decoupling", () => {
  it("emits a bass note when rhythm is set even with voiceLead false", () => {
    const events = [cMaj(0, 4)];
    const notes = findVoicing("block-full").voice(events, {
      ...OPTS,
      voiceLead: false,
      rhythm: { bass: [0], chord: [] },
    });

    // No chord hand; one bass note at the low root (lowBassPitch(0) = 36),
    // voice 0, id `-b${i}`, duration spanning to the chord end.
    expect(notes).toEqual([
      { id: "chord-b0", pitch: 36, start: 0, duration: 4, velocity: 80, track: "chords", voice: 0 },
    ]);
  });
});

describe("bassTrack split", () => {
  it("routes bass to bassTrack while chord tones stay on track (block path)", () => {
    const events = [cMaj(0, 4)];
    const notes = findVoicing("block-full").voice(events, {
      ...OPTS,
      bassTrack: "chords-bass",
      voiceLead: true, // wantsBass → a bass note is emitted in the block path
    });

    const bass = notes.filter((n) => n.voice === 0);
    const upper = notes.filter((n) => n.voice === 1);
    expect(bass.length).toBe(1);
    expect(bass[0]!.track).toBe("chords-bass");
    expect(upper.length).toBeGreaterThan(0);
    for (const n of upper) expect(n.track).toBe("chords");
  });

  it("routes bass to bassTrack while chord tones stay on track (rhythm path)", () => {
    const events = [cMaj(0, 4)];
    const notes = findVoicing("block-full").voice(events, {
      ...OPTS,
      bassTrack: "chords-bass",
      rhythm: { bass: [0], chord: [0] },
    });

    const bass = notes.filter((n) => n.voice === 0);
    const upper = notes.filter((n) => n.voice === 1);
    expect(bass.length).toBe(1);
    expect(bass[0]!.track).toBe("chords-bass");
    expect(upper.length).toBeGreaterThan(0);
    for (const n of upper) expect(n.track).toBe("chords");
  });
});

describe("duration clipping", () => {
  it("a note never rings across a chord change", () => {
    // C over [0,4), G over [4,8); a chord onset at beat 3 with the next onset at
    // beat 5. Without clipping the note would ring 3→5 (duration 2); it must be
    // clipped to the C chord's end at beat 4 (duration 1).
    const events = [cMaj(0, 4), gMaj(4, 8)];
    const notes = findVoicing("block-full").voice(events, {
      ...OPTS,
      rhythm: { bass: [], chord: [3, 5] },
    });

    const at3 = notes.filter((n) => n.start === 3);
    const at5 = notes.filter((n) => n.start === 5);
    expect(at3.length).toBeGreaterThan(0);
    for (const n of at3) expect(n.duration).toBe(1); // clipped at the chord change
    for (const n of at5) expect(n.duration).toBe(3); // 5 → G end at 8
    // The beat-3 note sounds the C triad; the beat-5 note the G triad.
    expect(at3.map((n) => n.pitch).sort((a, b) => a - b)).toEqual([60, 64, 67]);
    expect(at5.map((n) => n.pitch).sort((a, b) => a - b)).toEqual([67, 71, 74]);
  });
});
