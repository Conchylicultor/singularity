/**
 * Chord-detection robustness tests. Run with `bun test` from the repo root.
 *
 * Covers the weighted best-fit detector (`detectChord` / `detectChordWeighted`),
 * the beat-quantized segmentation (`detectChordWindows`), and the `beatGrid`
 * helper — the three pieces of the dense-input robustness redesign.
 */

import { test, expect } from "bun:test";
import {
  beatGrid,
  emptyScore,
  type Note,
  type Score,
  type TimeSigEvent,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  detectChord,
  detectChordWeighted,
  detectChordWindows,
} from "@plugins/apps/plugins/sonata/plugins/theory/core";

// --- fixtures --------------------------------------------------------------

let nid = 0;
const note = (pitch: number, start: number, duration: number, velocity = 90): Note => ({
  id: `n${nid++}`,
  pitch,
  start,
  duration,
  velocity,
  track: "t",
});

const scoreOf = (
  notes: Note[],
  timeSig: TimeSigEvent = { beat: 0, numerator: 4, denominator: 4 },
): Score => ({ ...emptyScore(), timeSigMap: [timeSig], notes });

/** Build a length-12 PC weight profile from a {pitch-class: weight} map. */
const profile = (weights: Record<number, number>): number[] => {
  const p = new Array<number>(12).fill(0);
  for (const [pc, w] of Object.entries(weights)) p[Number(pc)] = w;
  return p;
};

// --- detectChord / detectChordWeighted -------------------------------------

test("dense doubled voicing → one C major", () => {
  const m = detectChord([60, 64, 67, 72, 76]); // C E G + octave-doubled C E
  expect(m?.data.root).toBe(0);
  expect(m?.data.quality).toBe("maj");
  expect(m?.data.symbol).toBe("C");
  expect(m!.confidence).toBeGreaterThan(0.9);
});

test("light passing tone is suppressed — chord still detected", () => {
  // C E G heavy, a fleeting D barely sounding.
  const m = detectChordWeighted(profile({ 0: 4, 4: 4, 7: 4, 2: 0.25 }));
  expect(m?.data.root).toBe(0);
  expect(m?.data.quality).toBe("maj");
});

test("heavy non-chord tone defeats a clean chord", () => {
  // A foreign D as heavy as the chord tones combined → no confident chord.
  const m = detectChordWeighted(profile({ 0: 1, 4: 1, 7: 1, 2: 4 }));
  // Either nothing fits the floor, or it is no longer a plain C major triad.
  if (m) expect(m.data.symbol).not.toBe("C");
});

test("bass bias resolves the symmetric augmented triad", () => {
  // C-E-G# is enharmonically C+/E+/G#+ — the bass decides the root.
  const aug = profile({ 0: 1, 4: 1, 8: 1 });
  expect(detectChordWeighted(aug, 0)?.data.root).toBe(0);
  expect(detectChordWeighted(aug, 4)?.data.root).toBe(4);
  expect(detectChordWeighted(aug, 8)?.data.root).toBe(8);
  expect(detectChordWeighted(aug, 4)?.data.quality).toBe("aug");
});

test("first inversion → slash chord", () => {
  const m = detectChordWeighted(profile({ 0: 1, 4: 1, 7: 1 }), 4); // C/E
  expect(m?.data.root).toBe(0);
  expect(m?.data.quality).toBe("maj");
  expect(m?.data.bass).toBe(4);
  expect(m?.data.symbol).toBe("C/E");
});

test("root in bass emits no slash", () => {
  const m = detectChordWeighted(profile({ 0: 1, 4: 1, 7: 1 }), 0);
  expect(m?.data.bass).toBeUndefined();
  expect(m?.data.symbol).toBe("C");
});

test("dominant 7th with a 9th → '9'", () => {
  // G B D F A → G dominant 9th.
  const m = detectChordWeighted(profile({ 7: 1, 11: 1, 2: 1, 5: 1, 9: 1 }));
  expect(m?.data.root).toBe(7);
  expect(m?.data.quality).toBe("dom9");
  expect(m?.data.symbol).toBe("G9");
});

test("an incomplete voicing reads as less confident than a full chord", () => {
  const full = detectChordWeighted(profile({ 0: 1, 4: 1, 7: 1 })); // C major
  const dyad = detectChordWeighted(profile({ 0: 1, 4: 1 })); // C+E, missing the 5th
  expect(full?.data.symbol).toBe("C");
  expect(full!.confidence).toBeGreaterThan(0.95);
  // The dyad still implies C major, but with markedly lower confidence — not the
  // falsely-perfect score a missing-tone-blind formula would report.
  expect(dyad?.data.root).toBe(0);
  expect(dyad!.confidence).toBeLessThan(0.8);
  expect(dyad!.confidence).toBeGreaterThan(0.4);
});

test("atonal cluster → no chord", () => {
  const m = detectChord([60, 61, 62, 63, 64, 65]); // C C# D D# E F
  expect(m).toBeNull();
});

test("a single pitch-class is not a chord", () => {
  expect(detectChord([60, 72])).toBeNull(); // only C
});

// --- detectChordWindows ----------------------------------------------------

test("sustained arpeggio collapses to a single chord window", () => {
  // Broken C major with pedal: each note holds to the bar end.
  const s = scoreOf([note(60, 0, 4), note(64, 1, 3), note(67, 2, 2), note(72, 3, 1)]);
  const w = detectChordWindows(s);
  expect(w.length).toBe(1);
  expect(w[0]!.data.symbol).toBe("C");
});

test("block and broken voicings of the same chord read identically", () => {
  const block = detectChordWindows(scoreOf([note(60, 0, 4), note(64, 0, 4), note(67, 0, 4)]));
  const broken = detectChordWindows(scoreOf([note(60, 0, 4), note(64, 1, 3), note(67, 2, 2)]));
  expect(block.map((x) => x.data.symbol)).toEqual(["C"]);
  expect(broken.map((x) => x.data.symbol)).toEqual(["C"]);
});

test("a one-beat transient flanked by identical chords is smoothed away", () => {
  const s = scoreOf([
    // C major beats 0–1
    note(60, 0, 2), note(64, 0, 2), note(67, 0, 2),
    // stray D minor on beat 2
    note(62, 2, 1), note(65, 2, 1), note(69, 2, 1),
    // C major beats 3–4
    note(60, 3, 2), note(64, 3, 2), note(67, 3, 2),
  ]);
  const w = detectChordWindows(s);
  expect(w.length).toBe(1);
  expect(w[0]!.data.symbol).toBe("C");
});

test("a passing tone over a held chord does not flicker", () => {
  const s = scoreOf([
    note(60, 0, 4), note(64, 0, 4), note(67, 0, 4), // held C major
    note(62, 1, 1), // passing D on beat 2
  ]);
  const w = detectChordWindows(s);
  expect(w.map((x) => x.data.symbol)).toEqual(["C"]);
});

test("an inversion renders a slash symbol end-to-end", () => {
  const s = scoreOf([
    note(40, 0, 4), // low E in the bass
    note(60, 0, 4), note(64, 0, 4), note(67, 0, 4), // C major above
  ]);
  const w = detectChordWindows(s);
  expect(w.length).toBe(1);
  expect(w[0]!.data.symbol).toBe("C/E");
  expect(w[0]!.data.bass).toBe(4);
});

test("authored skipSpans suppress overlapping derived windows", () => {
  const s = scoreOf([note(60, 0, 4), note(64, 0, 4), note(67, 0, 4)]);
  const w = detectChordWindows(s, { skipSpans: [{ start: 0, end: 4 }] });
  expect(w).toEqual([]);
});

test("empty score → no windows", () => {
  expect(detectChordWindows(emptyScore())).toEqual([]);
});

// --- beatGrid --------------------------------------------------------------

test("beatGrid: 4/4 default is a quarter-beat pulse", () => {
  const g = beatGrid(scoreOf([note(60, 0, 4)]));
  expect(g.map((c) => c.startBeat)).toEqual([0, 1, 2, 3, 4]);
});

test("beatGrid: 6/8 pulses every eighth note (0.5 beats)", () => {
  const s = scoreOf([note(60, 0, 3)], { beat: 0, numerator: 6, denominator: 8 });
  expect(beatGrid(s).map((c) => c.startBeat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
});

test("beatGrid: a pickup is cell 0 (mirrors bars)", () => {
  const s: Score = { ...scoreOf([note(60, 0.5, 3.5)]), meta: { pickupBeats: 0.5 } };
  const g = beatGrid(s);
  expect(g[0]!.startBeat).toBe(0);
  expect(g[1]!.startBeat).toBe(0.5);
  expect(g[2]!.startBeat).toBe(1.5);
});

test("beatGrid: subdivisions halves the cell length", () => {
  const g = beatGrid(scoreOf([note(60, 0, 2)]), 2);
  expect(g.map((c) => c.startBeat)).toEqual([0, 0.5, 1, 1.5, 2]);
});
