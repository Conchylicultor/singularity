/**
 * Tests for `computeFlatReorder` — the flat (non-hierarchical) rank-reorder
 * arithmetic shared by `rank-reorder`, the data-view manual-order, and the
 * tree's sibling branches (`computeDrop` delegates here). Run with
 * `bun test plugins/primitives/plugins/rank/core/internal/flat-reorder.test.ts`.
 *
 * Contract: the returned rank places the dragged item strictly on the correct
 * side of the target relative to its NEW neighbors, with the dragged item
 * excluded from its own neighborhood; `null` signals an impossible drop
 * (self-drop, unknown target, rank exhaustion).
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "./rank";
import { computeFlatReorder, type RankedItem } from "./flat-reorder";

const mk = (id: string, rankStr: string): RankedItem => ({
  id,
  rank: Rank.from(rankStr),
});

describe("computeFlatReorder", () => {
  test("self-drop → null", () => {
    const items = [mk("a", "a0"), mk("b", "a2")];
    expect(computeFlatReorder(items, "a", "before", "a")).toBeNull();
    expect(computeFlatReorder(items, "a", "after", "a")).toBeNull();
  });

  test("unknown target → null", () => {
    const items = [mk("a", "a0")];
    expect(computeFlatReorder(items, "a", "after", "nope")).toBeNull();
  });

  test("before a sibling lands below its rank", () => {
    const items = [mk("a", "a0"), mk("b", "a2"), mk("c", "a4")];
    const rank = computeFlatReorder(items, "c", "before", "b");
    expect(rank).not.toBeNull();
    // between a (a0) and b (a2): above a0, below a2.
    expect(Rank.compare(rank!, Rank.from("a0"))).toBe(1);
    expect(Rank.compare(rank!, Rank.from("a2"))).toBe(-1);
  });

  test("after a sibling lands above its rank", () => {
    const items = [mk("a", "a0"), mk("b", "a2"), mk("c", "a4")];
    const rank = computeFlatReorder(items, "a", "after", "b");
    expect(rank).not.toBeNull();
    // between b (a2) and c (a4): above a2, below a4.
    expect(Rank.compare(rank!, Rank.from("a2"))).toBe(1);
    expect(Rank.compare(rank!, Rank.from("a4"))).toBe(-1);
  });

  test("before the first item lands at the head (open lower end)", () => {
    const items = [mk("a", "a1"), mk("b", "a2")];
    const rank = computeFlatReorder(items, "b", "before", "a");
    expect(rank).not.toBeNull();
    expect(Rank.compare(rank!, Rank.from("a1"))).toBe(-1);
  });

  test("after the last item lands at the tail (open upper end)", () => {
    const items = [mk("a", "a1"), mk("b", "a2")];
    const rank = computeFlatReorder(items, "a", "after", "b");
    expect(rank).not.toBeNull();
    expect(Rank.compare(rank!, Rank.from("a2"))).toBe(1);
  });

  test("dragged item excluded from its own neighborhood", () => {
    // a, b, c; drop b after a → b filtered out, result lands strictly between a and c.
    const items = [mk("a", "a0"), mk("b", "a2"), mk("c", "a4")];
    const rank = computeFlatReorder(items, "b", "after", "a");
    expect(rank).not.toBeNull();
    expect(Rank.compare(rank!, Rank.from("a0"))).toBe(1);
    expect(Rank.compare(rank!, Rank.from("a4"))).toBe(-1);
  });

  test("rank exhaustion (between two equal ranks) → null", () => {
    // x and y share a rank; dragging z before y forces Rank.between(a0, a0) → throws → null.
    const items = [mk("x", "a0"), mk("y", "a0")];
    expect(computeFlatReorder(items, "z", "before", "y")).toBeNull();
  });

  test("cross-section: dragged item absent from the target list still resolves", () => {
    // The dragged item lives in another group, so it is not among `items`.
    const items = [mk("a", "a0"), mk("b", "a2")];
    const rank = computeFlatReorder(items, "elsewhere", "after", "a");
    expect(rank).not.toBeNull();
    expect(Rank.compare(rank!, Rank.from("a0"))).toBe(1);
    expect(Rank.compare(rank!, Rank.from("a2"))).toBe(-1);
  });
});
