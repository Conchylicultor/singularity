import { describe, expect, test } from "bun:test";
import { flingPosition, flingRest, flingVelocity } from "./decay";

describe("flingRest", () => {
  test("equals from + velocity/friction", () => {
    expect(flingRest(10, 100, 5)).toBeCloseTo(10 + 100 / 5, 10);
    expect(flingRest(-3, -200, 8)).toBeCloseTo(-3 + -200 / 8, 10);
  });
});

describe("flingPosition", () => {
  test("at t=0 is exactly `from`", () => {
    expect(flingPosition(42, 500, 5, 0)).toBe(42);
  });

  test("is monotonic toward rest for positive velocity", () => {
    const from = 0;
    const v = 300;
    const k = 5;
    let prev = from;
    for (let t = 0.05; t <= 2; t += 0.05) {
      const x = flingPosition(from, v, k, t);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });

  test("at large t approaches rest", () => {
    const rest = flingRest(0, 300, 5);
    expect(flingPosition(0, 300, 5, 100)).toBeCloseTo(rest, 6);
  });

  test("never overshoots rest", () => {
    const rest = flingRest(0, 300, 5);
    for (let t = 0; t <= 5; t += 0.1) {
      expect(flingPosition(0, 300, 5, t)).toBeLessThanOrEqual(rest + 1e-9);
    }
  });
});

describe("flingVelocity", () => {
  test("starts at v0 and decays to ~0", () => {
    expect(flingVelocity(400, 5, 0)).toBe(400);
    expect(flingVelocity(400, 5, 100)).toBeCloseTo(0, 6);
  });
});

describe("friction guard", () => {
  test("non-positive friction throws", () => {
    expect(() => flingPosition(0, 1, 0, 1)).toThrow();
    expect(() => flingVelocity(1, -1, 1)).toThrow();
    expect(() => flingRest(0, 1, 0)).toThrow();
  });
});
