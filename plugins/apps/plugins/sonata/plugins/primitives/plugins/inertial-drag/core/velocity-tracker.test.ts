import { describe, expect, test } from "bun:test";
import { createVelocityTracker } from "./velocity-tracker";

describe("createVelocityTracker", () => {
  test("straight-line samples yield the constant velocity", () => {
    // Move 10 px every 10 ms within an 80 ms window → 1000 px/s.
    const tracker = createVelocityTracker(80);
    for (let i = 0; i <= 5; i++) {
      tracker.sample(i * 10, i * 10);
    }
    expect(tracker.velocity()).toBeCloseTo(1000, 6);
  });

  test("drops stale samples outside the window", () => {
    const tracker = createVelocityTracker(80);
    // A stale sample far in the past would skew a naive oldest-vs-newest calc.
    tracker.sample(0, 0);
    // Recent in-window samples: from 200..230 ms, 5 px each 10 ms → 500 px/s.
    tracker.sample(200, 1000);
    tracker.sample(210, 1005);
    tracker.sample(220, 1010);
    tracker.sample(230, 1015);
    expect(tracker.velocity()).toBeCloseTo(500, 6);
  });

  test("fewer than 2 samples → 0", () => {
    const tracker = createVelocityTracker();
    expect(tracker.velocity()).toBe(0);
    tracker.sample(0, 0);
    expect(tracker.velocity()).toBe(0);
  });

  test("dt ≈ 0 → 0 (no division blowup)", () => {
    const tracker = createVelocityTracker();
    tracker.sample(100, 0);
    tracker.sample(100, 50);
    expect(tracker.velocity()).toBe(0);
  });

  test("reset clears samples", () => {
    const tracker = createVelocityTracker();
    tracker.sample(0, 0);
    tracker.sample(10, 100);
    expect(tracker.velocity()).not.toBe(0);
    tracker.reset();
    expect(tracker.velocity()).toBe(0);
  });
});
