/**
 * Pure unit tests for the shared anchor→rank resolver (`internal/adjacent.ts`).
 * Run with `bun test plugins/primitives/plugins/rank/server/internal/adjacent.test.ts`.
 *
 * Covers the sibling-list boundaries (`targetId === null`), positioning around a
 * middle target, `excludeIds` not bounding their own insertion, an unknown
 * target, and the degenerate (tied-rank) neighbourhood.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { rankAdjacentTo, type RankAdjacentRow } from "./adjacent";

const EMPTY = new Set<string>();

function mk(id: string, parentId: string | null, rank: Rank): RankAdjacentRow {
  return { id, parentId, rank: rank.toJSON() };
}

const r1 = Rank.between(null, null);
const r2 = Rank.between(r1, null);
const r3 = Rank.between(r2, null);

// a < b < c under one parent, plus an unrelated row under another parent so
// every case also proves the `parentId` filter holds.
const rows: RankAdjacentRow[] = [
  mk("a", "p", r1),
  mk("b", "p", r2),
  mk("c", "p", r3),
  mk("other", "q", r1),
];

describe("rankAdjacentTo", () => {
  test("null target + after → appends past the last sibling", () => {
    const rank = rankAdjacentTo(rows, "p", null, "after", EMPTY);
    expect(Rank.compare(rank, r3)).toBe(1);
  });

  test("null target + before → prepends ahead of the first sibling", () => {
    const rank = rankAdjacentTo(rows, "p", null, "before", EMPTY);
    expect(Rank.compare(rank, r1)).toBe(-1);
  });

  test("null target on an empty sibling list → any valid rank", () => {
    expect(() => rankAdjacentTo(rows, "empty", null, "after", EMPTY)).not.toThrow();
    expect(() => rankAdjacentTo(rows, "empty", null, "before", EMPTY)).not.toThrow();
  });

  test("before a middle target → lands between its predecessor and it", () => {
    const rank = rankAdjacentTo(rows, "p", "b", "before", EMPTY);
    expect(Rank.compare(rank, r1)).toBe(1);
    expect(Rank.compare(rank, r2)).toBe(-1);
  });

  test("after a middle target → lands between it and its successor", () => {
    const rank = rankAdjacentTo(rows, "p", "b", "after", EMPTY);
    expect(Rank.compare(rank, r2)).toBe(1);
    expect(Rank.compare(rank, r3)).toBe(-1);
  });

  test("after the last target → open upper bound", () => {
    const rank = rankAdjacentTo(rows, "p", "c", "after", EMPTY);
    expect(Rank.compare(rank, r3)).toBe(1);
  });

  test("before the first target → open lower bound", () => {
    const rank = rankAdjacentTo(rows, "p", "a", "before", EMPTY);
    expect(Rank.compare(rank, r1)).toBe(-1);
  });

  test("excludeIds never bound their own insertion point", () => {
    // Move "b" to after "a": excluded, "b" cannot be its own successor bound, so
    // the window is (a, c) rather than the empty (a, b).
    const rank = rankAdjacentTo(rows, "p", "a", "after", new Set(["b"]));
    expect(Rank.compare(rank, r1)).toBe(1);
    expect(Rank.compare(rank, r3)).toBe(-1);
  });

  test("an excluded row is still resolvable as the target", () => {
    // The excluded row is dropped from the bounding set but stays addressable —
    // a no-op drag onto itself must not read as an unknown target.
    const rank = rankAdjacentTo(rows, "p", "b", "after", new Set(["b"]));
    expect(Rank.compare(rank, r2)).toBe(1);
    expect(Rank.compare(rank, r3)).toBe(-1);
  });

  test("unknown target throws rather than appending", () => {
    expect(() => rankAdjacentTo(rows, "p", "nope", "after", EMPTY)).toThrow(
      /target nope is not among the siblings/,
    );
  });

  test("a degenerate (tied-rank) neighbourhood collapses to one position", () => {
    // Two siblings sharing a rank hold no order relative to each other, so a
    // drop "between" them has no honest answer. Both scans are strict, so the
    // tie is treated as ONE position and the key lands outside the whole run —
    // `Rank.between(r, r)` is never constructed and nothing aborts.
    const tied: RankAdjacentRow[] = [mk("a", "p", r1), mk("b", "p", r1)];

    const afterTie = rankAdjacentTo(tied, "p", "a", "after", EMPTY);
    expect(Rank.compare(afterTie, r1)).toBe(1);

    const beforeTie = rankAdjacentTo(tied, "p", "b", "before", EMPTY);
    expect(Rank.compare(beforeTie, r1)).toBe(-1);
  });

  test("a tie ahead of the target still bounds against the target itself", () => {
    // a and b tie at r1, c sits at r2. Dropping before c must land strictly
    // between the tied run and c — never inside the tie, never past c.
    const tied: RankAdjacentRow[] = [mk("a", "p", r1), mk("b", "p", r1), mk("c", "p", r2)];
    const rank = rankAdjacentTo(tied, "p", "c", "before", EMPTY);
    expect(Rank.compare(rank, r1)).toBe(1);
    expect(Rank.compare(rank, r2)).toBe(-1);
  });

  test("accepts an already-wrapped Rank as well as the stored string", () => {
    const wrapped: RankAdjacentRow[] = [
      { id: "a", parentId: "p", rank: r1 },
      { id: "b", parentId: "p", rank: r2 },
    ];
    const rank = rankAdjacentTo(wrapped, "p", "a", "after", EMPTY);
    expect(Rank.compare(rank, r1)).toBe(1);
    expect(Rank.compare(rank, r2)).toBe(-1);
  });
});
