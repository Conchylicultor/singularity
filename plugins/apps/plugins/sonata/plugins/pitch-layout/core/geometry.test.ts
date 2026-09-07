/**
 * The invariants EVERY pitch layout owes, looped over the whole closed set — so
 * a third layout inherits this suite the moment it is labelled, with no test to
 * write.
 *
 * The load-bearing one is "a note lands on its key": every pad's center is its
 * pitch's column center. The pads and the columns are two separate outputs
 * (they deliberately differ in WIDTH on Jankó), so nothing but this check keeps
 * the keyboard under the roll aligned with the notes falling onto it.
 */

import { expect, test } from "bun:test";
import type { PitchLayoutId } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { PITCH_LAYOUT_LABELS } from "./config";
import { pitchGeometry, pitchKeyboardHeight } from "./geometry";

const LAYOUTS = Object.keys(PITCH_LAYOUT_LABELS) as PitchLayoutId[];
/** Ranges every consumer actually asks for: the full keyboard and a chip. */
const RANGES: [number, number][] = [
  [21, 108],
  [60, 95],
  [48, 72],
];
const EPS = 1e-9;

test("every layout is labelled and reachable", () => {
  expect(LAYOUTS.length).toBeGreaterThan(1);
  for (const id of LAYOUTS)
    expect(PITCH_LAYOUT_LABELS[id].length).toBeGreaterThan(0);
});

test("pads span exactly [0, 1]", () => {
  for (const id of LAYOUTS) {
    for (const [low, high] of RANGES) {
      const plane = pitchGeometry(id, low, high);
      expect(plane.keys.length).toBeGreaterThan(0);
      let left = Infinity;
      let right = -Infinity;
      for (const k of plane.keys) {
        expect(k.width).toBeGreaterThan(0);
        expect(k.height).toBeGreaterThan(0);
        left = Math.min(left, k.center - k.width / 2);
        right = Math.max(right, k.center + k.width / 2);
        // Y stays inside the keybed too — a chrome may not be handed a pad
        // hanging off the bottom of the box it paints in.
        expect(k.top).toBeGreaterThanOrEqual(-EPS);
        expect(k.top + k.height).toBeLessThanOrEqual(1 + EPS);
      }
      expect(left).toBeCloseTo(0, 9);
      expect(right).toBeCloseTo(1, 9);
    }
  }
});

test("exactly one column per pitch in [low, high], ascending and contiguous", () => {
  for (const id of LAYOUTS) {
    for (const [low, high] of RANGES) {
      const plane = pitchGeometry(id, low, high);
      expect(plane.columns.length).toBe(plane.high - plane.low + 1);
      plane.columns.forEach((c, i) => {
        expect(c.pitch).toBe(plane.low + i);
        expect(c.width).toBeGreaterThan(0);
      });
    }
  }
});

test("every pad's center is its pitch's column center", () => {
  for (const id of LAYOUTS) {
    for (const [low, high] of RANGES) {
      const plane = pitchGeometry(id, low, high);
      const byPitch = new Map(plane.columns.map((c) => [c.pitch, c]));
      for (const k of plane.keys) {
        const col = byPitch.get(k.pitch);
        expect(col).toBeDefined();
        expect(k.center).toBeCloseTo(col!.center, 10);
      }
    }
  }
});

test("pads are ordered ascending by tier then pitch", () => {
  for (const id of LAYOUTS) {
    const plane = pitchGeometry(id, 21, 108);
    for (let i = 1; i < plane.keys.length; i++) {
      const prev = plane.keys[i - 1]!;
      const cur = plane.keys[i]!;
      expect(cur.tier).toBeGreaterThanOrEqual(prev.tier);
      if (cur.tier === prev.tier)
        expect(cur.pitch).toBeGreaterThanOrEqual(prev.pitch);
    }
  }
});

test("every guide coincides with a column's left edge", () => {
  for (const id of LAYOUTS) {
    for (const [low, high] of RANGES) {
      const plane = pitchGeometry(id, low, high);
      expect(plane.guides.length).toBeGreaterThan(0);
      const edges = plane.columns.map((c) => c.center - c.width / 2);
      for (const g of plane.guides) {
        expect(edges.some((e) => Math.abs(e - g.frac) < EPS)).toBe(true);
      }
      // At least one strong rule: an octave landmark is what makes a keyboard
      // readable, and an isomorphic one is unreadable without it.
      expect(plane.guides.some((g) => g.strong)).toBe(true);
    }
  }
});

test("snapRange only widens, and is idempotent", () => {
  for (const id of LAYOUTS) {
    for (const [low, high] of [...RANGES, [61, 94] as [number, number]]) {
      const once = pitchGeometry(id, low, high);
      expect(once.low).toBeLessThanOrEqual(low);
      expect(once.high).toBeGreaterThanOrEqual(high);
      const twice = pitchGeometry(id, once.low, once.high);
      expect(twice.low).toBe(once.low);
      expect(twice.high).toBe(once.high);
    }
  }
});

test("geometry is pure — deep-equal across calls", () => {
  for (const id of LAYOUTS) {
    const a = pitchGeometry(id, 21, 108);
    const b = pitchGeometry(id, 21, 108);
    expect(a).toEqual(b);
    // …and a fresh object each time, so a consumer's memo on array identity is
    // its own memo and never accidentally shared module state.
    expect(a.keys).not.toBe(b.keys);
  }
});

test("keybed and chip heights are positive integers, keybed the taller", () => {
  for (const id of LAYOUTS) {
    for (const size of ["keybed", "chip"] as const) {
      const h = pitchKeyboardHeight(id, size);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
    }
    expect(pitchKeyboardHeight(id, "keybed")).toBeGreaterThan(
      pitchKeyboardHeight(id, "chip"),
    );
  }
});
