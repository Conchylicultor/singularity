import { describe, expect, test } from "bun:test";
import { isPedalDownAt, pedalSpans, resolvePedalSustain } from "./pedal";
import type { Note, PedalEvent } from "./types";

let nid = 0;
function note(pitch: number, start: number, duration: number, track = "t0"): Note {
  return { id: `n${nid++}`, pitch, start, duration, velocity: 80, track };
}

describe("resolvePedalSustain", () => {
  test("no pedal events → empty map (natural off, zero overhead)", () => {
    const notes = [note(60, 0, 1), note(62, 1, 1)];
    expect(resolvePedalSustain(notes, []).size).toBe(0);
  });

  test("track with no pedal lane is untouched even if others are pedalled", () => {
    const a = note(60, 0, 1, "t0");
    const b = note(64, 0, 1, "t1");
    const pedal: PedalEvent[] = [
      { track: "t0", beat: 0, down: true },
      { track: "t0", beat: 4, down: false },
    ];
    const map = resolvePedalSustain([a, b], pedal);
    expect(map.get(a)).toBe(4); // held to lift
    expect(map.has(b)).toBe(false); // other track: natural off
  });

  test("note released under a held pedal rings until the pedal lifts", () => {
    // Pedal down at 0, note sounds [0,1), pedal lifts at 4 → held to 4.
    const n = note(60, 0, 1);
    const pedal: PedalEvent[] = [
      { track: "t0", beat: 0, down: true },
      { track: "t0", beat: 4, down: false },
    ];
    expect(resolvePedalSustain([n], pedal).get(n)).toBe(4);
  });

  test("pedal pressed AFTER the note's natural off does not resurrect it", () => {
    // Note ends at 1; pedal only goes down at 2 → not held.
    const n = note(60, 0, 1);
    const pedal: PedalEvent[] = [
      { track: "t0", beat: 2, down: true },
      { track: "t0", beat: 4, down: false },
    ];
    expect(resolvePedalSustain([n], pedal).has(n)).toBe(false);
  });

  test("re-strike cap: held note stops at the next onset of the same pitch", () => {
    // Both C4s under one long pedal; the first must stop when the second hits.
    const a = note(60, 0, 1);
    const b = note(60, 2, 1);
    const pedal: PedalEvent[] = [
      { track: "t0", beat: 0, down: true },
      { track: "t0", beat: 8, down: false },
    ];
    const map = resolvePedalSustain([a, b], pedal);
    expect(map.get(a)).toBe(2); // capped at the re-strike, not the lift (8)
    expect(map.get(b)).toBe(8); // last one rings to the lift
  });

  test("a different pitch under the same pedal is NOT capped by an unrelated onset", () => {
    const c = note(60, 0, 1);
    const e = note(64, 2, 1);
    const pedal: PedalEvent[] = [
      { track: "t0", beat: 0, down: true },
      { track: "t0", beat: 8, down: false },
    ];
    const map = resolvePedalSustain([c, e], pedal);
    expect(map.get(c)).toBe(8); // C4 not capped by the E4 onset
    expect(map.get(e)).toBe(8);
  });

  test("pedal that never lifts holds the note to its own natural end (no extension)", () => {
    // Down at 0, never released. A note released at 1 would ring "to the end",
    // but with no lift event we leave it at its natural off (synth release tail
    // does the rest) — i.e. no recorded extension.
    const n = note(60, 0, 1);
    const pedal: PedalEvent[] = [{ track: "t0", beat: 0, down: true }];
    expect(resolvePedalSustain([n], pedal).has(n)).toBe(false);
  });

  test("only genuine extensions are recorded (note already longer than the lift)", () => {
    // Note sounds [0,5); pedal lifts at 4 (before the natural off) → no shortening.
    const n = note(60, 0, 5);
    const pedal: PedalEvent[] = [
      { track: "t0", beat: 0, down: true },
      { track: "t0", beat: 4, down: false },
    ];
    // Natural off (5) is past the lift (4); pedal is UP at beat 5 → not held.
    expect(resolvePedalSustain([n], pedal).has(n)).toBe(false);
  });

  test("re-pedal: a note is held only across the span its own release falls in", () => {
    // Two pedal presses. Note released at 1 during the FIRST press → held to 2.
    const n = note(60, 0, 1);
    const pedal: PedalEvent[] = [
      { track: "t0", beat: 0, down: true },
      { track: "t0", beat: 2, down: false },
      { track: "t0", beat: 3, down: true },
      { track: "t0", beat: 5, down: false },
    ];
    expect(resolvePedalSustain([n], pedal).get(n)).toBe(2);
  });
});

describe("pedalSpans", () => {
  test("empty lane → no spans", () => {
    expect(pedalSpans([])).toEqual([]);
  });

  test("pairs down→up per track; a trailing press with no lift is upBeat=null", () => {
    const events: PedalEvent[] = [
      { track: "t0", beat: 0, down: true },
      { track: "t0", beat: 2, down: false },
      { track: "t0", beat: 4, down: true }, // never lifts
      { track: "t1", beat: 1, down: true },
      { track: "t1", beat: 3, down: false },
    ];
    expect(pedalSpans(events)).toEqual([
      { track: "t0", downBeat: 0, upBeat: 2 },
      { track: "t0", downBeat: 4, upBeat: null },
      { track: "t1", downBeat: 1, upBeat: 3 },
    ]);
  });

  test("redundant repeated same-state events don't open spurious spans", () => {
    const events: PedalEvent[] = [
      { track: "t0", beat: 0, down: true },
      { track: "t0", beat: 1, down: true }, // redundant
      { track: "t0", beat: 2, down: false },
      { track: "t0", beat: 3, down: false }, // redundant
    ];
    expect(pedalSpans(events)).toEqual([{ track: "t0", downBeat: 0, upBeat: 2 }]);
  });
});

describe("isPedalDownAt", () => {
  const events: PedalEvent[] = [
    { track: "t0", beat: 0, down: true },
    { track: "t0", beat: 4, down: false },
    { track: "t1", beat: 6, down: true },
    { track: "t1", beat: 8, down: false },
  ];

  test("false on an empty lane at any beat", () => {
    expect(isPedalDownAt([], 5)).toBe(false);
  });

  test("true while any track's pedal is down; false in the gaps", () => {
    expect(isPedalDownAt(events, 2)).toBe(true); // t0 down
    expect(isPedalDownAt(events, 5)).toBe(false); // both up
    expect(isPedalDownAt(events, 7)).toBe(true); // t1 down
    expect(isPedalDownAt(events, 9)).toBe(false); // both up
  });
});
