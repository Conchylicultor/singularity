/**
 * Tests for the pure client-side reorder prediction used by the queue's
 * optimistic-mutation adopter. Run with `bun test`.
 *
 * The invariant: applyReorder reproduces the server's rankAdjacentTo +
 * reseatGroupMembers as a pure transform of the LIVE rank rows, so the dragged
 * conversation (and its group) lands in the same SORTED position the server will
 * confirm — the WS push then reconciles with no visual snap.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { OpNoLongerApplies } from "@plugins/primitives/plugins/optimistic-mutation/web";
import type { QueueRankRow } from "../../core/resources";
import { applyReorder } from "./apply-reorder";

// Build the live rank rows from id→rank-string pairs (ranks are evenly spaced keys).
function rows(pairs: [string, string][]): QueueRankRow[] {
  return pairs.map(([conversationId, r]) => ({
    conversationId,
    rank: Rank.from(r),
  }));
}

// Sorted conversation ids after applying — the visible order.
function order(next: QueueRankRow[]): string[] {
  return [...next]
    .sort((a, b) => Rank.compare(a.rank, b.rank))
    .map((r) => r.conversationId);
}

// fractional-indexing keys are ascending: "a0" < "a1" < "a2" < "a3".
const KEYS = ["a0", "a1", "a2", "a3", "a4"];

describe("applyReorder", () => {
  test("move last item before the first", () => {
    const data = rows([
      ["a", KEYS[0]!],
      ["b", KEYS[1]!],
      ["c", KEYS[2]!],
    ]);
    const next = applyReorder(data, { conversationId: "c", targetId: "a", zone: "before" });
    expect(order(next)).toEqual(["c", "a", "b"]);
  });

  test("move first item after the last", () => {
    const data = rows([
      ["a", KEYS[0]!],
      ["b", KEYS[1]!],
      ["c", KEYS[2]!],
    ]);
    const next = applyReorder(data, { conversationId: "a", targetId: "c", zone: "after" });
    expect(order(next)).toEqual(["b", "c", "a"]);
  });

  test("move into the middle (after a middle target)", () => {
    const data = rows([
      ["a", KEYS[0]!],
      ["b", KEYS[1]!],
      ["c", KEYS[2]!],
      ["d", KEYS[3]!],
    ]);
    // move d to right after a
    const next = applyReorder(data, { conversationId: "d", targetId: "a", zone: "after" });
    expect(order(next)).toEqual(["a", "d", "b", "c"]);
  });

  test("dropping on self is a no-op", () => {
    const data = rows([["a", KEYS[0]!], ["b", KEYS[1]!]]);
    const next = applyReorder(data, { conversationId: "a", targetId: "a", zone: "before" });
    expect(next).toBe(data);
  });

  test("a group (shared rank) moves together to the new rank", () => {
    // a and b share a rank (same task group); c and d are separate.
    const data = rows([
      ["a", KEYS[1]!],
      ["b", KEYS[1]!], // same rank as a ⇒ same group
      ["c", KEYS[2]!],
      ["d", KEYS[3]!],
    ]);
    // drag a after d ⇒ the whole {a,b} group lands after d, both sharing the new rank
    const next = applyReorder(data, { conversationId: "a", targetId: "d", zone: "after" });
    expect(order(next)).toEqual(["c", "d", "a", "b"]);
    const aRank = next.find((r) => r.conversationId === "a")!.rank;
    const bRank = next.find((r) => r.conversationId === "b")!.rank;
    expect(Rank.equals(aRank, bRank)).toBe(true);
  });

  test("throws OpNoLongerApplies when the dragged conversation left the live set (overlay drops the op)", () => {
    const data = rows([["a", KEYS[0]!]]);
    expect(() =>
      applyReorder(data, { conversationId: "ghost", targetId: "a", zone: "before" }),
    ).toThrow(OpNoLongerApplies);
  });

  test("throws OpNoLongerApplies when the target left the live set", () => {
    const data = rows([["a", KEYS[0]!]]);
    expect(() =>
      applyReorder(data, { conversationId: "a", targetId: "ghost", zone: "after" }),
    ).toThrow(OpNoLongerApplies);
  });
});
