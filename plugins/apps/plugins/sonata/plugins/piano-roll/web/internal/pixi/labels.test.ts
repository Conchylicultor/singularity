/**
 * Tests for the pure parts of the label layer: the `noteLabelFontPx` sizing
 * rules (moved verbatim from the DOM renderer — these tests pin the exact
 * behaviour the visual design was tuned against) and the `createLabelWindow`
 * binary-search windowing.
 */
import { expect, test } from "bun:test";
import { createLabelWindow, noteLabelFontPx } from "./labels";

// --- noteLabelFontPx ------------------------------------------------------------

test("returns null below the legible floor", () => {
  // FLOOR=7, LETTER_EM=0.7, FILL=0.94 ⇒ widthFit = w·0.94/0.7 < 7 ⇔ w < ~5.21.
  expect(noteLabelFontPx(5, 100, false)).toBeNull();
  expect(noteLabelFontPx(5.2, 100, false)).toBeNull();
  // Just past the cutoff it returns a size (>= FLOOR).
  expect(noteLabelFontPx(5.3, 100, false)).not.toBeNull();
  expect(noteLabelFontPx(5.3, 100, false)!).toBeGreaterThanOrEqual(7);
});

test("width-fit drives the size: wider keys get larger labels", () => {
  const narrow = noteLabelFontPx(10, 1000, false)!;
  const wide = noteLabelFontPx(20, 1000, false)!;
  expect(wide).toBeGreaterThan(narrow);
  // Exact formula: width × FILL / LETTER_EM when unconstrained by height/ceiling.
  expect(narrow).toBeCloseTo((10 * 0.94) / 0.7, 10);
  expect(wide).toBeCloseTo((20 * 0.94) / 0.7, 10);
});

test("an accidental widens the em budget, shrinking the label", () => {
  const natural = noteLabelFontPx(12, 1000, false)!;
  const accidental = noteLabelFontPx(12, 1000, true)!;
  expect(accidental).toBeLessThan(natural);
  expect(accidental).toBeCloseTo((12 * 0.94) / (0.7 + 0.34), 10);
  // The wider budget also raises the null cutoff: a width that fits a natural
  // can fail for an accidental.
  expect(noteLabelFontPx(6, 1000, false)).not.toBeNull();
  expect(noteLabelFontPx(6, 1000, true)).toBeNull();
});

test("short bars cap the size at 85% of the bar height", () => {
  // Width would allow ~26.9px, but a 10px bar caps it to 8.5px.
  expect(noteLabelFontPx(20, 10, false)).toBeCloseTo(8.5, 10);
  // Even the height cap never dips below the floor once width fits.
  expect(noteLabelFontPx(20, 2, false)).toBe(7);
});

test("28px ceiling for very wide keys", () => {
  expect(noteLabelFontPx(60, 1000, false)).toBe(28);
  expect(noteLabelFontPx(500, 1000, true)).toBe(28);
});

// --- createLabelWindow ------------------------------------------------------------

const onsets = (...secs: number[]) => secs.map((y0Sec) => ({ y0Sec }));

test("returns the half-open index range of onsets in [minSec, maxSec]", () => {
  const query = createLabelWindow(onsets(0, 1, 2, 3, 4, 5));
  expect(query(1, 3)).toEqual({ start: 1, end: 4 }); // inclusive both ends
  expect(query(0.5, 3.5)).toEqual({ start: 1, end: 4 });
  expect(query(-10, 10)).toEqual({ start: 0, end: 6 });
});

test("boundary onsets are included on both edges", () => {
  const query = createLabelWindow(onsets(0, 1, 2, 3));
  expect(query(0, 0)).toEqual({ start: 0, end: 1 });
  expect(query(3, 3)).toEqual({ start: 3, end: 4 });
});

test("empty ranges produce start === end (nothing live)", () => {
  const query = createLabelWindow(onsets(0, 1, 2, 3));
  expect(query(1.2, 1.8)).toEqual({ start: 2, end: 2 });
  expect(query(10, 20)).toEqual({ start: 4, end: 4 });
  expect(query(-5, -1)).toEqual({ start: 0, end: 0 });
});

test("duplicate onsets (chords) are all included", () => {
  const query = createLabelWindow(onsets(0, 1, 1, 1, 2));
  expect(query(1, 1)).toEqual({ start: 1, end: 4 });
});

test("empty note list always yields the empty window", () => {
  const query = createLabelWindow([]);
  expect(query(0, 100)).toEqual({ start: 0, end: 0 });
});
