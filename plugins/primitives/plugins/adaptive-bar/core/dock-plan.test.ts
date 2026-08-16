/**
 * Tests for `planMoves` — the dock reconciliation plan.
 *
 * The contract has two halves and both are load-bearing: applying the plan must
 * produce the target order (correctness), and it must touch as few nodes as
 * possible (every untouched node keeps its focus, pointer capture, transitions
 * and scroll offset). The zero-move case is the one users feel.
 */

import { describe, expect, test } from "bun:test";
import { planMoves, type DockMove } from "./dock-plan";

/** Apply a plan the way the DOM would: remove strays first, then move in order. */
function apply(
  currentIds: readonly string[],
  wantIds: readonly string[],
  moves: DockMove[],
): string[] {
  const want = new Set(wantIds);
  const dock = currentIds.filter((id) => want.has(id));
  for (const move of moves) {
    const from = dock.indexOf(move.id);
    if (from !== -1) dock.splice(from, 1);
    if (move.beforeId === null) {
      dock.push(move.id);
      continue;
    }
    const at = dock.indexOf(move.beforeId);
    expect(at).toBeGreaterThanOrEqual(0); // the anchor must already be in place
    dock.splice(at, 0, move.id);
  }
  return dock;
}

/** The theoretical minimum: everything that is not in a longest common increasing run. */
function minimumMoves(
  currentIds: readonly string[],
  wantIds: readonly string[],
): number {
  const wantIndex = new Map(wantIds.map((id, i) => [id, i] as const));
  const seq = currentIds.flatMap((id) => {
    const at = wantIndex.get(id);
    return at === undefined ? [] : [at];
  });
  // O(n²) LIS — fine for a test oracle, and independent of the implementation.
  const best = seq.map(() => 1);
  for (let i = 0; i < seq.length; i++) {
    for (let j = 0; j < i; j++) {
      if (seq[j]! < seq[i]!) best[i] = Math.max(best[i]!, best[j]! + 1);
    }
  }
  return wantIds.length - Math.max(0, ...best);
}

describe("planMoves", () => {
  test("an unchanged order plans ZERO moves", () => {
    expect(planMoves(["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
    expect(planMoves([], [])).toEqual([]);
    expect(planMoves(["only"], ["only"])).toEqual([]);
  });

  test("a removal alone plans zero moves — the caller undocks the stray", () => {
    expect(planMoves(["a", "b", "c"], ["a", "c"])).toEqual([]);
  });

  test("one item to the back is one move", () => {
    const current = ["a", "b", "c"];
    const want = ["b", "c", "a"];
    const moves = planMoves(current, want);
    expect(moves).toEqual([{ id: "a", beforeId: null }]);
    expect(apply(current, want, moves)).toEqual(want);
  });

  test("one item to the front is one move", () => {
    const current = ["a", "b", "c"];
    const want = ["c", "a", "b"];
    const moves = planMoves(current, want);
    expect(moves).toEqual([{ id: "c", beforeId: "a" }]);
    expect(apply(current, want, moves)).toEqual(want);
  });

  test("one item to the middle is one move", () => {
    const current = ["a", "b", "c", "d"];
    const want = ["b", "a", "c", "d"];
    const moves = planMoves(current, want);
    expect(moves).toHaveLength(1);
    expect(apply(current, want, moves)).toEqual(want);
  });

  test("an insertion is one move and disturbs nobody else", () => {
    const current = ["a", "c"];
    const want = ["a", "b", "c"];
    const moves = planMoves(current, want);
    expect(moves).toEqual([{ id: "b", beforeId: "c" }]);
    expect(apply(current, want, moves)).toEqual(want);
  });

  test("appending is one move anchored at the end", () => {
    const current = ["a", "b"];
    const want = ["a", "b", "c"];
    expect(planMoves(current, want)).toEqual([{ id: "c", beforeId: null }]);
  });

  test("a full reversal costs n-1 moves, not n", () => {
    const current = ["a", "b", "c", "d"];
    const want = ["d", "c", "b", "a"];
    const moves = planMoves(current, want);
    expect(moves).toHaveLength(3);
    expect(apply(current, want, moves)).toEqual(want);
  });

  test("relocating one widget out and back leaves the others untouched", () => {
    // The real scenario: `c` left for the panel and came back. Nothing else moved.
    const current = ["a", "b", "d", "e"];
    const want = ["a", "b", "c", "d", "e"];
    const moves = planMoves(current, want);
    expect(moves).toEqual([{ id: "c", beforeId: "d" }]);
  });

  test("duplicate ids fail loudly rather than moving the wrong node", () => {
    expect(() => planMoves(["a", "a"], ["a"])).toThrow(/duplicate item id/);
    expect(() => planMoves(["a"], ["a", "a"])).toThrow(/duplicate item id/);
  });

  test("property: random shuffles apply correctly and are minimal", () => {
    let seed = 0x5eed;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + rand(9);
      const all = Array.from({ length: n }, (_, i) => `i${i}`);
      const current = all.filter(() => rand(10) > 0);
      const want = all.filter(() => rand(10) > 0);
      // Shuffle the target order.
      for (let i = want.length - 1; i > 0; i--) {
        const j = rand(i + 1);
        [want[i], want[j]] = [want[j]!, want[i]!];
      }
      const moves = planMoves(current, want);
      expect(apply(current, want, moves)).toEqual(want);
      expect(moves.length).toBe(minimumMoves(current, want));
    }
  });
});
