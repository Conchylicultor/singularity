import { beforeEach, describe, expect, test } from "bun:test";
import { admitTrace, resetRateLimit } from "./rate-limit";

const COOLDOWN = 10_000;
const MAX_PER_MIN = 30;

beforeEach(() => {
  resetRateLimit();
});

describe("admitTrace", () => {
  test("admits the first trace for a trigger", () => {
    expect(admitTrace("loader:a", 1_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });

  test("rejects a same-trigger trace within the cooldown", () => {
    expect(admitTrace("loader:a", 1_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
    expect(admitTrace("loader:a", 1_000 + COOLDOWN - 1, COOLDOWN, MAX_PER_MIN)).toBe(false);
    expect(admitTrace("loader:a", 1_000 + COOLDOWN, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });

  test("cooldown is per-trigger: a different trigger is admitted immediately", () => {
    expect(admitTrace("loader:a", 1_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
    expect(admitTrace("http:b", 1_001, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });

  test("caps admissions per minute globally", () => {
    for (let i = 0; i < MAX_PER_MIN; i++) {
      expect(admitTrace(`loader:op-${i}`, 1_000 + i, COOLDOWN, MAX_PER_MIN)).toBe(true);
    }
    expect(admitTrace("loader:fresh", 2_000, COOLDOWN, MAX_PER_MIN)).toBe(false);
  });

  test("the minute bucket refills after 60s", () => {
    for (let i = 0; i < MAX_PER_MIN; i++) {
      admitTrace(`loader:op-${i}`, 1_000 + i, COOLDOWN, MAX_PER_MIN);
    }
    expect(admitTrace("loader:fresh", 2_000, COOLDOWN, MAX_PER_MIN)).toBe(false);
    expect(admitTrace("loader:fresh", 1_000 + 60_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });

  test("a cooldown rejection does not consume a minute token", () => {
    expect(admitTrace("loader:a", 1_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
    for (let i = 0; i < 5; i++) {
      expect(admitTrace("loader:a", 1_001 + i, COOLDOWN, MAX_PER_MIN)).toBe(false);
    }
    // 29 tokens must remain for other triggers within the same minute.
    for (let i = 0; i < MAX_PER_MIN - 1; i++) {
      expect(admitTrace(`loader:other-${i}`, 2_000 + i, COOLDOWN, MAX_PER_MIN)).toBe(true);
    }
    expect(admitTrace("loader:one-too-many", 3_000, COOLDOWN, MAX_PER_MIN)).toBe(false);
  });

  test("a critical trigger bypasses the per-minute cap but still honors cooldown", () => {
    // Saturate the minute with non-critical traces.
    for (let i = 0; i < MAX_PER_MIN; i++) {
      admitTrace(`loader:op-${i}`, 1_000 + i, COOLDOWN, MAX_PER_MIN);
    }
    expect(admitTrace("loader:fresh", 2_000, COOLDOWN, MAX_PER_MIN)).toBe(false);
    // A critical trigger is admitted despite the exhausted budget…
    expect(admitTrace("stall:x", 2_000, COOLDOWN, MAX_PER_MIN, true)).toBe(true);
    // …but a second critical trigger for the same key inside cooldown is rejected.
    expect(admitTrace("stall:x", 2_000 + COOLDOWN - 1, COOLDOWN, MAX_PER_MIN, true)).toBe(false);
    expect(admitTrace("stall:x", 2_000 + COOLDOWN, COOLDOWN, MAX_PER_MIN, true)).toBe(true);
  });

  test("clears the per-trigger map past the size bound (one extra trace per trigger, never unbounded)", () => {
    for (let i = 0; i <= 2048; i++) {
      admitTrace(`loader:op-${i}`, 1_000 + i * 61_000, COOLDOWN, MAX_PER_MIN);
    }
    // op-0 is inside its (long-elapsed) cooldown history, but the map was
    // cleared — it is admitted again rather than tracked forever.
    expect(admitTrace("loader:op-0", 2049 * 61_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });
});
