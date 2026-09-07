/**
 * The Jankó layout's exact numbers.
 *
 * The half-pad offset IS the layout: a pad is two strides wide and a semitone
 * step is one stride, so every chord shape is the same shape in every key. If
 * the pad/stride relation ever drifts the instrument stops being isomorphic, so
 * both are pinned here rather than inferred.
 */

import { expect, test } from "bun:test";
import { pitchGeometry } from "./geometry";

const LOW = 21;
const HIGH = 108;
const N = HIGH - LOW + 1;
const STRIDE = 1 / (N + 1);
const PLANE = pitchGeometry("janko", LOW, HIGH);

test("snapRange is the identity — Jankó tiles any range flush", () => {
  for (const [low, high] of [
    [21, 108],
    [61, 94],
    [60, 95],
  ] as const) {
    const plane = pitchGeometry("janko", low, high);
    expect([plane.low, plane.high]).toEqual([low, high]);
  }
});

test("every pad is 2/(N+1) wide and a quarter of the keybed tall", () => {
  for (const k of PLANE.keys) {
    expect(k.width).toBeCloseTo(2 * STRIDE, 12);
    expect(k.height).toBeCloseTo(0.25, 12);
    expect(k.tier).toBe(0);
  }
});

test("a note column is one stride — half a pad — so a chromatic run stays legible", () => {
  for (const c of PLANE.columns) {
    expect(c.width).toBeCloseTo(STRIDE, 12);
    expect(c.center).toBeCloseTo((c.pitch - LOW + 1) * STRIDE, 12);
  }
});

test("every pitch occupies exactly two rows, two apart", () => {
  const rowsByPitch = new Map<number, number[]>();
  for (const k of PLANE.keys) {
    const row = Math.round(k.top * 4);
    expect(row).toBeGreaterThanOrEqual(0);
    expect(row).toBeLessThan(4);
    rowsByPitch.set(k.pitch, [...(rowsByPitch.get(k.pitch) ?? []), row]);
  }
  expect(rowsByPitch.size).toBe(N);
  for (const rows of rowsByPitch.values()) {
    expect(rows.length).toBe(2);
    const sorted = [...rows].sort((a, b) => a - b);
    expect(sorted[1]! - sorted[0]!).toBe(2);
  }
});

test("the bottom row is the C row — even pitch classes, nearest the player", () => {
  const bottom = PLANE.keys.filter((k) => Math.round(k.top * 4) === 3);
  expect(bottom.length).toBeGreaterThan(0);
  for (const k of bottom) expect(k.pitch % 2).toBe(0);
  // C D E F# G# A# — the six even pitch classes, all present.
  const classes = new Set(bottom.map((k) => k.pitch % 12));
  expect([...classes].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 8, 10]);
  // And the row above it is the odd one, so the two interleave by a semitone.
  const above = PLANE.keys.filter((k) => Math.round(k.top * 4) === 2);
  for (const k of above) expect(k.pitch % 2).toBe(1);
});

test("pads tile each row edge to edge, never overlapping", () => {
  for (let row = 0; row < 4; row++) {
    const inRow = PLANE.keys
      .filter((k) => Math.round(k.top * 4) === row)
      .sort((a, b) => a.center - b.center);
    for (let i = 1; i < inRow.length; i++) {
      const prevRight = inRow[i - 1]!.center + inRow[i - 1]!.width / 2;
      const left = inRow[i]!.center - inRow[i]!.width / 2;
      expect(left).toBeCloseTo(prevRight, 10);
    }
  }
});

test("guides mark every C strong and every F# weak", () => {
  const marked = PLANE.columns.filter(
    (c) => c.pitch % 12 === 0 || c.pitch % 12 === 6,
  );
  expect(PLANE.guides.length).toBe(marked.length);
  marked.forEach((c, i) => {
    const g = PLANE.guides[i]!;
    expect(g.frac).toBeCloseTo(c.center - c.width / 2, 12);
    expect(g.strong).toBe(c.pitch % 12 === 0);
  });
});
