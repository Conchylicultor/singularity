import { describe, expect, test } from "bun:test";
import { HALF_LIFE_MS } from "./keys";
import { decayedScore, sortByUsage, type ScorableStat } from "./scoring";

const NOW = Date.UTC(2026, 7, 6, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function stat(score: number, agoMs: number): ScorableStat {
  return { score, lastUsedAt: new Date(NOW - agoMs) };
}

describe("decayedScore", () => {
  test("a 30-day-old score halves", () => {
    expect(decayedScore(stat(4, 30 * DAY_MS), NOW)).toBeCloseTo(2, 10);
  });

  test("HALF_LIFE_MS is exactly 30 days", () => {
    expect(HALF_LIFE_MS).toBe(30 * DAY_MS);
  });

  test("a just-used score is undecayed", () => {
    expect(decayedScore(stat(7, 0), NOW)).toBe(7);
  });

  test("two half-lives quarter the score", () => {
    expect(decayedScore(stat(8, 60 * DAY_MS), NOW)).toBeCloseTo(2, 10);
  });

  test("a future lastUsedAt is clamped, never amplified", () => {
    // Clock skew between the DB's now() and the browser must not inflate a row.
    expect(decayedScore(stat(3, -10 * DAY_MS), NOW)).toBe(3);
  });
});

describe("sortByUsage", () => {
  test("orders by decayed score, most-used first", () => {
    const stats = new Map<string, ScorableStat>([
      ["a", stat(2, 0)],
      ["b", stat(10, 0)],
      ["c", stat(5, 0)],
    ]);
    expect(sortByUsage(["a", "b", "c"], stats, NOW)).toEqual(["b", "c", "a"]);
  });

  test("recency beats a bigger but staler raw score", () => {
    const stats = new Map<string, ScorableStat>([
      ["stale", stat(10, 90 * DAY_MS)], // 10 * 0.5^3 = 1.25
      ["fresh", stat(2, 0)], // 2
    ]);
    expect(sortByUsage(["stale", "fresh"], stats, NOW)).toEqual(["fresh", "stale"]);
  });

  test("equal scores preserve the incoming order (stable)", () => {
    const stats = new Map<string, ScorableStat>([
      ["a", stat(3, 0)],
      ["b", stat(3, 0)],
      ["c", stat(3, 0)],
    ]);
    expect(sortByUsage(["c", "a", "b"], stats, NOW)).toEqual(["c", "a", "b"]);
    expect(sortByUsage(["b", "c", "a"], stats, NOW)).toEqual(["b", "c", "a"]);
  });

  test("never-used keys preserve the incoming (authored) order", () => {
    const keys = ["z", "y", "x", "w"];
    expect(sortByUsage(keys, new Map(), NOW)).toEqual(keys);
  });

  test("never-used keys keep authored order BELOW every used key", () => {
    const stats = new Map<string, ScorableStat>([["c", stat(1, 0)]]);
    expect(sortByUsage(["a", "b", "c", "d"], stats, NOW)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  test("stats for keys not in the list are ignored", () => {
    const stats = new Map<string, ScorableStat>([
      ["gone", stat(100, 0)],
      ["b", stat(1, 0)],
    ]);
    expect(sortByUsage(["a", "b"], stats, NOW)).toEqual(["b", "a"]);
  });

  test("does not mutate the incoming array", () => {
    const keys = ["a", "b"];
    sortByUsage(keys, new Map([["b", stat(9, 0)]]), NOW);
    expect(keys).toEqual(["a", "b"]);
  });
});
