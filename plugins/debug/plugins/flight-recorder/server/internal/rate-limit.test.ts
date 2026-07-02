import { beforeEach, describe, expect, test } from "bun:test";
import { admitSnapshot, resetRateLimit } from "./rate-limit";

const COOLDOWN = 10_000;
const MAX_PER_MIN = 30;

beforeEach(() => {
  resetRateLimit();
});

describe("admitSnapshot", () => {
  test("admits the first snapshot for an op", () => {
    expect(admitSnapshot("loader:a", 1_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });

  test("rejects a same-op snapshot within the cooldown", () => {
    expect(admitSnapshot("loader:a", 1_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
    expect(admitSnapshot("loader:a", 1_000 + COOLDOWN - 1, COOLDOWN, MAX_PER_MIN)).toBe(false);
    expect(admitSnapshot("loader:a", 1_000 + COOLDOWN, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });

  test("cooldown is per-op: a different op is admitted immediately", () => {
    expect(admitSnapshot("loader:a", 1_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
    expect(admitSnapshot("http:b", 1_001, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });

  test("caps admissions per minute globally", () => {
    for (let i = 0; i < MAX_PER_MIN; i++) {
      expect(admitSnapshot(`loader:op-${i}`, 1_000 + i, COOLDOWN, MAX_PER_MIN)).toBe(true);
    }
    expect(admitSnapshot("loader:fresh", 2_000, COOLDOWN, MAX_PER_MIN)).toBe(false);
  });

  test("the minute bucket refills after 60s", () => {
    for (let i = 0; i < MAX_PER_MIN; i++) {
      admitSnapshot(`loader:op-${i}`, 1_000 + i, COOLDOWN, MAX_PER_MIN);
    }
    expect(admitSnapshot("loader:fresh", 2_000, COOLDOWN, MAX_PER_MIN)).toBe(false);
    expect(admitSnapshot("loader:fresh", 1_000 + 60_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });

  test("a cooldown rejection does not consume a minute token", () => {
    expect(admitSnapshot("loader:a", 1_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
    for (let i = 0; i < 5; i++) {
      expect(admitSnapshot("loader:a", 1_001 + i, COOLDOWN, MAX_PER_MIN)).toBe(false);
    }
    // 29 tokens must remain for other ops within the same minute.
    for (let i = 0; i < MAX_PER_MIN - 1; i++) {
      expect(admitSnapshot(`loader:other-${i}`, 2_000 + i, COOLDOWN, MAX_PER_MIN)).toBe(true);
    }
    expect(admitSnapshot("loader:one-too-many", 3_000, COOLDOWN, MAX_PER_MIN)).toBe(false);
  });

  test("clears the per-op map past the size bound (one extra snapshot per op, never unbounded)", () => {
    for (let i = 0; i <= 2048; i++) {
      admitSnapshot(`loader:op-${i}`, 1_000 + i * 61_000, COOLDOWN, MAX_PER_MIN);
    }
    // op-0 is inside its (long-elapsed) cooldown history, but the map was
    // cleared — it is admitted again rather than tracked forever.
    expect(admitSnapshot("loader:op-0", 2049 * 61_000, COOLDOWN, MAX_PER_MIN)).toBe(true);
  });
});
