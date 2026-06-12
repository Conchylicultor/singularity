/**
 * Tests for the pure authored-space note geometry (`authoredSecondsOf` /
 * `buildNoteVisuals`). The load-bearing property is AUTHORED-SPACE INVARIANCE:
 * the incoming score's tempo map has `tempoScale` folded in (seconds =
 * authoredSeconds / tempoScale), and `authoredSecondsOf` must cancel that fold
 * exactly — so the visuals a renderer uploads to the GPU never change when the
 * user slows or speeds playback.
 */

import { expect, test } from "bun:test";
import {
  buildTempoIndex,
  emptyScore,
  makeKeySpeller,
  scaleTempo,
  type Note,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { keyLayout as fractionalKeyLayout } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/keyboard/web";
import {
  authoredSecondsOf,
  buildNoteVisuals,
  KEYBOARD_HIGH,
  KEYBOARD_LOW,
} from "./geometry";

// --- fixtures ----------------------------------------------------------------

let nid = 0;
const note = (
  pitch: number,
  start: number,
  duration: number,
  opts?: { velocity?: number; track?: string },
): Note => ({
  id: `n${nid++}`,
  pitch,
  start,
  duration,
  velocity: opts?.velocity ?? 90,
  track: opts?.track ?? "t1",
});

/** A tiny authored score: two tempo segments so the fold is non-trivial. */
const makeScore = (notes: Note[]): Score => ({
  ...emptyScore(),
  tracks: [{ id: "t1" }, { id: "t2" }],
  tempoMap: [
    { beat: 0, bpm: 120 },
    { beat: 4, bpm: 60 },
  ],
  notes,
});

const speller = makeKeySpeller();

const build = (score: Score, tempoScale = 1, over?: Partial<Parameters<typeof buildNoteVisuals>[0]>) =>
  buildNoteVisuals({
    score,
    hiddenIds: new Set<string>(),
    colorMap: new Map<string, string>(),
    blackKeyColor: (base) => base,
    speller,
    tempoScale,
    ...over,
  });

// --- authored-space invariance ------------------------------------------------

test("authoredSecondsOf cancels the tempoScale fold exactly", () => {
  const authored = makeScore([]);
  for (const tempoScale of [0.5, 1, 1.25, 2]) {
    // `scaleTempo` is exactly the fold the shell applies before handing the
    // score to displays: bpm × tempoScale ⇒ seconds = authored / tempoScale.
    const tempo = buildTempoIndex(scaleTempo(authored, tempoScale));
    const authoredTempo = buildTempoIndex(authored);
    for (const beat of [0, 1, 3.5, 4, 7, 12]) {
      expect(authoredSecondsOf(tempo, tempoScale, beat)).toBeCloseTo(
        authoredTempo.beatToSeconds(beat),
        10,
      );
    }
  }
});

test("note visuals are identical across tempoScale (given correctly-scaled maps)", () => {
  const notes = [note(60, 0, 1), note(61, 3, 2), note(72, 6, 0.5)];
  const authored = makeScore(notes);
  const at1 = build(scaleTempo(authored, 1), 1);
  const at05 = build(scaleTempo(authored, 0.5), 0.5);
  const at2 = build(scaleTempo(authored, 2), 2);
  for (const other of [at05, at2]) {
    expect(other.length).toBe(at1.length);
    for (let i = 0; i < at1.length; i++) {
      expect(other[i]!.y0Sec).toBeCloseTo(at1[i]!.y0Sec, 10);
      expect(other[i]!.y1Sec).toBeCloseTo(at1[i]!.y1Sec, 10);
    }
  }
  // Sanity: the second tempo segment (60bpm from beat 4) actually engaged —
  // beat 6 is 2s (beats 0–4 at 120) + 2s (beats 4–6 at 60) = 4s authored.
  expect(at1[2]!.y0Sec).toBeCloseTo(4, 10);
});

// --- per-note fields -----------------------------------------------------------

test("alpha maps velocity 0..127 onto 0.4..1.0", () => {
  const score = makeScore([
    note(60, 0, 1, { velocity: 0 }),
    note(60, 0, 1, { velocity: 127 }),
    note(60, 0, 1, { velocity: 64 }),
  ]);
  const [v0, v127, v64] = build(score);
  expect(v0!.alpha).toBeCloseTo(0.4, 10);
  expect(v127!.alpha).toBeCloseTo(1.0, 10);
  expect(v64!.alpha).toBeCloseTo(0.4 + (64 / 127) * 0.6, 10);
});

test("isBlack flags accidental pitch classes", () => {
  const score = makeScore([note(60, 0, 1), note(61, 0, 1)]); // C4, C#4
  const [c, cSharp] = build(score);
  expect(c!.isBlack).toBe(false);
  expect(cSharp!.isBlack).toBe(true);
  expect(c!.label).toEqual({ step: "C", accidental: "" });
  expect(cSharp!.label).toEqual({ step: "C", accidental: "♯" });
});

test("xFrac/wFrac match the keyboard primitive's fractional layout", () => {
  const lanes = new Map(
    fractionalKeyLayout(KEYBOARD_LOW, KEYBOARD_HIGH).map((k) => [k.pitch, k]),
  );
  const pitches = [21, 60, 61, 108]; // A0, C4 (white), C#4 (black), C8
  const score = makeScore(pitches.map((p) => note(p, 0, 1)));
  const visuals = build(score);
  visuals.forEach((v, i) => {
    const lane = lanes.get(pitches[i]!)!;
    expect(v.wFrac).toBeCloseTo(lane.width, 10);
    expect(v.xFrac).toBeCloseTo(lane.center - lane.width / 2, 10);
  });
  // Fractions, not pixels: everything lives in 0..1.
  for (const v of visuals) {
    expect(v.xFrac).toBeGreaterThanOrEqual(0);
    expect(v.xFrac + v.wFrac).toBeLessThanOrEqual(1 + 1e-9);
  }
});

test("hidden tracks are dropped entirely", () => {
  const score = makeScore([
    note(60, 0, 1, { track: "t1" }),
    note(62, 1, 1, { track: "t2" }),
    note(64, 2, 1, { track: "t1" }),
  ]);
  const visuals = build(score, 1, { hiddenIds: new Set(["t1"]) });
  expect(visuals.length).toBe(1);
  expect(visuals[0]!.trackId).toBe("t2");
});

test("colorExpr carries the track color, with var(--primary) as the uniform fallback", () => {
  const score = makeScore([
    note(60, 0, 1, { track: "t1" }),
    note(62, 0, 1, { track: "t2" }),
  ]);
  const visuals = build(score, 1, {
    colorMap: new Map([["t1", "var(--categorical-3)"]]),
  });
  expect(visuals[0]!.colorExpr).toBe("var(--categorical-3)");
  expect(visuals[1]!.colorExpr).toBe("var(--primary)");
});
