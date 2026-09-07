/**
 * The piano layout's exact numbers.
 *
 * These are pinned, not merely sanity-checked: under `piano` the roll and the
 * keyboard must stay PIXEL-IDENTICAL to the single `keyLayout` formula this
 * replaced, so 1/52 and 0.62 are the contract and not an implementation detail.
 */

import { expect, test } from "bun:test";
import { isAccidental } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { pitchGeometry } from "./geometry";

const FULL = pitchGeometry("piano", 21, 108);

test("52 naturals tile 21..108 edge to edge at 1/52", () => {
  const naturals = FULL.keys.filter((k) => !isAccidental(k.pitch));
  expect(naturals.length).toBe(52);
  const w = 1 / 52;
  naturals.forEach((k, i) => {
    expect(k.width).toBeCloseTo(w, 12);
    expect(k.center).toBeCloseTo(i * w + w / 2, 12);
    expect(k.top).toBe(0);
    expect(k.height).toBe(1);
    expect(k.tier).toBe(0);
  });
});

test("36 accidentals sit on natural boundaries, 0.62 wide and 0.62 tall, tier 1", () => {
  const accidentals = FULL.keys.filter((k) => isAccidental(k.pitch));
  expect(accidentals.length).toBe(36);
  const w = 1 / 52;
  const naturalEdges = new Set(
    Array.from({ length: 53 }, (_, i) => (i * w).toFixed(12)),
  );
  for (const k of accidentals) {
    expect(k.width).toBeCloseTo(w * 0.62, 12);
    expect(k.height).toBeCloseTo(0.62, 12);
    expect(k.top).toBe(0);
    expect(k.tier).toBe(1);
    expect(naturalEdges.has(k.center.toFixed(12))).toBe(true);
  }
});

test("guides mark pitch class 0 strong and pitch class 5 weak", () => {
  expect(FULL.guides.length).toBe(
    FULL.columns.filter((c) => c.pitch % 12 === 0 || c.pitch % 12 === 5).length,
  );
  const byFrac = new Map(
    FULL.columns.map((c) => [c.pitch, c.center - c.width / 2]),
  );
  for (const c of FULL.columns) {
    const pc = c.pitch % 12;
    const guide = FULL.guides.find(
      (g) => Math.abs(g.frac - byFrac.get(c.pitch)!) < 1e-12,
    );
    if (pc === 0) expect(guide?.strong).toBe(true);
    else if (pc === 5) expect(guide?.strong).toBe(false);
  }
});

test("columns are the pads: a falling note is exactly as wide as its key", () => {
  const byPitch = new Map(FULL.keys.map((k) => [k.pitch, k]));
  for (const c of FULL.columns) {
    const key = byPitch.get(c.pitch)!;
    expect(c.width).toBeCloseTo(key.width, 12);
    expect(c.center).toBeCloseTo(key.center, 12);
  }
});

test("snapRange widens off an accidental endpoint, and is the identity on every range Sonata asks for", () => {
  // C#4..A#6 — both ends accidental, so both widen outward to a natural.
  const widened = pitchGeometry("piano", 61, 94);
  expect(widened.low).toBe(60);
  expect(widened.high).toBe(95);
  for (const [low, high] of [
    [21, 108],
    [60, 95],
  ] as const) {
    const plane = pitchGeometry("piano", low, high);
    expect([plane.low, plane.high]).toEqual([low, high]);
  }
});
