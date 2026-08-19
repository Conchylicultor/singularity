/**
 * Pure-geometry tests for the drawn key skin's pen. Everything here runs with no
 * DOM — which this file also implicitly verifies, since `sketch-paths.ts` is the
 * framework-free half of the skin and must stay importable under plain
 * `bun test`.
 *
 * The property that matters most is stability: a key's squiggle is a function of
 * its pitch alone, so it must survive re-renders, note-ons and remounts. If that
 * ever breaks, the keyboard shimmers during playback.
 */

import { expect, test } from "bun:test";
import {
  drawnKeyPath,
  drawnLine,
  keyRng,
  sketchMetrics,
  type DrawnKeyOptions,
} from "./sketch-paths";

const key = (over: Partial<DrawnKeyOptions> = {}): DrawnKeyOptions => ({
  x: 10,
  y: 0,
  width: 26,
  height: 100,
  seed: 60,
  amp: 1.7,
  topRadius: 1.5,
  bottomRadius: 4.5,
  ...over,
});

test("keyRng is deterministic per (pitch, salt) and decorrelated across both", () => {
  const draw = (pitch: number, salt: number) => {
    const r = keyRng(pitch, salt);
    return [r(), r(), r(), r()];
  };
  expect(draw(60, 3)).toEqual(draw(60, 3));
  expect(draw(60, 3)).not.toEqual(draw(61, 3));
  expect(draw(60, 3)).not.toEqual(draw(60, 11));
  // Every draw is a well-formed 0..1 unit float.
  for (const v of draw(60, 3)) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("a key's path depends only on its seed — the no-shimmer property", () => {
  expect(drawnKeyPath(key())).toBe(drawnKeyPath(key()));
  expect(drawnKeyPath(key({ seed: 61 }))).not.toBe(drawnKeyPath(key()));
  // The second pass over the same outline (seed + 977 in the skin) must be a
  // different squiggle, or the overdraw lands exactly on the first line and the
  // pen-pressure read disappears.
  expect(drawnKeyPath(key({ seed: 60 + 977, amp: 1.7 * 0.7 }))).not.toBe(
    drawnKeyPath(key()),
  );
});

test("the path is a closed outline over the key's box", () => {
  const d = drawnKeyPath(key());
  expect(d.startsWith("M ")).toBe(true);
  expect(d.endsWith("Z")).toBe(true);
  // Nine commands then the close: no NaN can survive into the attribute.
  expect(d).not.toContain("NaN");
  const numbers = d.match(/-?\d+\.\d\d/g) ?? [];
  expect(numbers.length).toBeGreaterThan(20);
  for (const n of numbers) expect(Number.isFinite(Number(n))).toBe(true);
});

test("amp 0 is a steady hand — the same box every time, wobble-free", () => {
  const steady = drawnKeyPath(key({ amp: 0 }));
  // With no jitter the shape is purely the box, so seed becomes irrelevant.
  expect(drawnKeyPath(key({ amp: 0, seed: 61 }))).toBe(steady);
  // ...and the outline sits exactly on the box's edges.
  expect(steady).toContain("10.00"); // x
  expect(steady).toContain("36.00"); // x + width
});

test("a degenerate (zero-size) key still emits a finite path", () => {
  const d = drawnKeyPath(key({ width: 0, height: 0 }));
  expect(d).not.toContain("NaN");
  expect(d.endsWith("Z")).toBe(true);
});

test("drawnLine samples ~every 90px, with a 6-segment floor for short rules", () => {
  const segments = (d: string) => (d.match(/ L /g) ?? []).length;
  expect(segments(drawnLine(0, 100, 5, 1, 1.2))).toBe(6); // floor
  expect(segments(drawnLine(0, 1800, 5, 1, 1.2))).toBe(20); // 1800 / 90
  expect(drawnLine(0, 900, 5, 1, 1.2)).toBe(drawnLine(0, 900, 5, 1, 1.2));
});

test("drawnLine walks x from x0 to x1 and stays within amp of y", () => {
  const d = drawnLine(0, 900, 50, 1, 1.2);
  const points = [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
  expect(points[0]!.x).toBe(0);
  expect(points.at(-1)!.x).toBe(900);
  for (let i = 1; i < points.length; i++) {
    expect(points[i]!.x).toBeGreaterThan(points[i - 1]!.x);
    expect(Math.abs(points[i]!.y - 50)).toBeLessThanOrEqual(1.2);
  }
});

test("sketchMetrics scales the pen to the key, and clamps at both ends", () => {
  // Full 88-key roll — the prototype's own tuning.
  const roll = sketchMetrics(104);
  expect(roll.amp).toBeCloseTo(1.8, 5);
  expect(roll.scale).toBeCloseTo(1, 5);

  // An `h-11` readout chip: a visibly lighter hand, not a scaled-down copy.
  const chip = sketchMetrics(44);
  expect(chip.amp).toBeLessThan(roll.amp);
  expect(chip.scale).toBeLessThan(roll.scale);
  expect(chip.amp).toBeGreaterThan(0);

  // Neither end runs away: a huge keyboard does not get a 6px wobble, and a
  // tiny one keeps a drawable line.
  expect(sketchMetrics(4000).amp).toBe(1.8);
  expect(sketchMetrics(4000).scale).toBe(1);
  expect(sketchMetrics(1).amp).toBe(0.4);
  expect(sketchMetrics(1).scale).toBe(0.45);
  expect(sketchMetrics(0).amp).toBe(0.4);
});
