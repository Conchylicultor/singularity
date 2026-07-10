/**
 * Pure unit suite for the two order-ops. No React, no DB.
 *
 * Run: `bun test plugins/primitives/plugins/data-view/plugins/view-order`
 */

import { describe, test, expect } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { seedRanks, applyMove } from "./order-ops";

/** The displayed sequence: keys sorted by their (total) synthesized rank. */
function displayOrder(ranks: ReadonlyMap<string, Rank>): string[] {
  return [...ranks.entries()]
    .sort(([, a], [, b]) => Rank.compare(a, b))
    .map(([key]) => key);
}

/** A dense persisted order, exactly what the server writes for `order`. */
function persist(order: readonly string[]): Map<string, Rank> {
  const ranks = Rank.nBetween(null, null, order.length);
  return new Map(order.map((key, i): [string, Rank] => [key, ranks[i]!]));
}

describe("seedRanks", () => {
  test("seeds an all-unpersisted list in source order", () => {
    const ranks = seedRanks(["A", "B", "C"], new Map());
    expect(ranks.size).toBe(3);
    expect(Rank.compare(ranks.get("A")!, ranks.get("B")!)).toBe(-1);
    expect(Rank.compare(ranks.get("B")!, ranks.get("C")!)).toBe(-1);
  });

  test("is total — every ordered key gets a rank", () => {
    const ranks = seedRanks(["A", "B"], persist(["A"]));
    expect([...ranks.keys()].sort()).toEqual(["A", "B"]);
  });

  test("appends unpersisted keys after max(persisted), in source order", () => {
    // "B" is persisted first but sorts LAST among the persisted ranks, so the
    // seeds must land after it — not after the first-seen persisted rank.
    const persisted = persist(["C", "B"]);
    expect(displayOrder(seedRanks(["A", "B", "C", "D"], persisted))).toEqual([
      "C",
      "B",
      "A",
      "D",
    ]);
  });

  test("max(persisted) spans keys absent from the ordered set", () => {
    // "Z" is filtered out of the view (not in orderedKeys) but still holds the
    // highest rank. "A" seeds after Z, so it displays after "B" despite coming
    // first in source order.
    const persisted = persist(["B", "Z"]);
    expect(displayOrder(seedRanks(["A", "B"], persisted))).toEqual(["B", "A"]);
  });
});

describe("applyMove", () => {
  test("re-inserts before the target", () => {
    expect(applyMove(["A", "B", "C"], "C", "B", "before")).toEqual([
      "A",
      "C",
      "B",
    ]);
  });

  test("re-inserts after the target", () => {
    expect(applyMove(["A", "B", "C"], "A", "B", "after")).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  test("zone 'after' at the tail appends", () => {
    expect(applyMove(["A", "B", "C"], "A", "C", "after")).toEqual([
      "B",
      "C",
      "A",
    ]);
  });

  test("moving a row to its own current neighbour position is a no-op sequence", () => {
    // A already sits immediately before B — dropping it there changes nothing.
    expect(applyMove(["A", "B", "C"], "A", "B", "before")).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  test("dropping a row onto itself returns the unchanged sequence", () => {
    expect(applyMove(["A", "B", "C"], "B", "B", "before")).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  test("returns null for an unknown targetId", () => {
    expect(applyMove(["A", "B", "C"], "A", "Z", "before")).toBeNull();
  });

  test("returns null for an unknown dragged id", () => {
    expect(applyMove(["A", "B", "C"], "Z", "A", "before")).toBeNull();
  });
});

describe("stability of the full-replace rule (the A2 counterexample)", () => {
  test("a persisted full replace survives the next render's seeding", () => {
    const source = ["A", "B", "C"];

    // 1. Nothing persisted: seeds follow source order.
    expect(displayOrder(seedRanks(source, new Map()))).toEqual(["A", "B", "C"]);

    // 2. The user drags C above B.
    const moved = applyMove(source, "C", "B", "before");
    expect(moved).toEqual(["A", "C", "B"]);

    // 3. The server persists the WHOLE post-move sequence with dense ranks —
    //    not just the moved row. Source order is still A,B,C on the next render.
    const persisted = persist(moved!);
    expect(displayOrder(seedRanks(source, persisted))).toEqual(["A", "C", "B"]);

    // The naive "persist only the moved row, re-seed the rest after
    // max(persisted)" rule would display C,A,B here. Pin that it does not.
    const naive = seedRanks(source, new Map([["C", Rank.from("a1")]]));
    expect(displayOrder(naive)).toEqual(["C", "A", "B"]);
  });

  test("a row entering the view after a persisted order lands at the end", () => {
    const persisted = persist(["A", "C", "B"]);
    // "D" is new (no entry at all) and appears mid-source-order; it seeds last.
    expect(displayOrder(seedRanks(["A", "D", "B", "C"], persisted))).toEqual([
      "A",
      "C",
      "B",
      "D",
    ]);
  });
});
