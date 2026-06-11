/**
 * Pure unit tests for the optimistic block-overlay layer.
 * Run with `bun test plugins/page/plugins/editor/`.
 *
 * Exercises the load-bearing invariants of `optimistic-block-ops.ts`: the single
 * `isReflected` predicate per effect kind, the `applyOverlayOp` round-trip
 * (Block[] → reducer → Block[]), the idempotency guard (re-applying an already-
 * reflected op throws `OpNoLongerApplies`), and chained compose (a split absorbed
 * by the base drops while a following outdent still applies).
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { OpNoLongerApplies } from "@plugins/primitives/plugins/optimistic-mutation/web";
import type { Block } from "../../core";
import {
  applyOverlayOp,
  buildOverlayOp,
  isReflected,
  type BlockOverlayOp,
  type OpEffect,
} from "./optimistic-block-ops";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A few stable, ascending rank keys for readable fixtures. */
const a = Rank.between(null, null).toJSON();
function after(prev: string): string {
  return Rank.between(Rank.from(prev), null).toJSON();
}

/** Build a full `Block` row (the resource shape, with `Rank` + timestamps). */
function mk(
  id: string,
  parentId: string | null,
  rank: string,
  opts: { text?: string; expanded?: boolean; type?: string; pageId?: string | null } = {},
): Block {
  return {
    id,
    pageId: opts.pageId === undefined ? "page-1" : opts.pageId,
    parentId,
    type: opts.type ?? "text",
    data: { text: opts.text ?? id },
    rank: Rank.from(rank),
    expanded: opts.expanded ?? false,
    createdAt: new Date("2020-01-01T00:00:00Z"),
    updatedAt: new Date("2020-01-01T00:00:00Z"),
  };
}

// ---------------------------------------------------------------------------
// isReflected
// ---------------------------------------------------------------------------

describe("isReflected", () => {
  const blocks = [mk("A", null, a), mk("B", null, after(a))];

  test("create: true when the id is present, false when absent", () => {
    expect(isReflected(blocks, { kind: "create", id: "A" })).toBe(true);
    expect(isReflected(blocks, { kind: "create", id: "NEW" })).toBe(false);
  });

  test("remove: true when the id is absent, false when present", () => {
    expect(isReflected(blocks, { kind: "remove", id: "GONE" })).toBe(true);
    expect(isReflected(blocks, { kind: "remove", id: "A" })).toBe(false);
  });

  test("reparent: matches on id + parentId + rank; rank mismatch → false", () => {
    const target = blocks.find((b) => b.id === "B")!;
    const rank = String(target.rank);
    const e: OpEffect = { kind: "reparent", id: "B", parentId: null, rank };
    expect(isReflected(blocks, e)).toBe(true);
    // Same parent, different rank ⇒ not yet reflected (a reorder is distinct).
    expect(isReflected(blocks, { ...e, rank: after(rank) })).toBe(false);
    // Different parent ⇒ not reflected.
    expect(isReflected(blocks, { ...e, parentId: "A" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyOverlayOp round-trip
// ---------------------------------------------------------------------------

describe("applyOverlayOp", () => {
  test("round-trips a split (Block[] → Block[]) producing exactly one new node", () => {
    const blocks = [mk("A", null, a, { text: "helloworld" })];
    const overlay = buildOverlayOp(
      { kind: "split", blockId: "A", position: 5, newId: "NEW" },
      blocks,
    );
    const out = applyOverlayOp(blocks, overlay);

    expect(out.length).toBe(2);
    const created = out.filter((b) => b.id === "NEW");
    expect(created.length).toBe(1);
    // The result rows are full Blocks: `rank` is a Rank instance, timestamps set.
    const newNode = created[0]!;
    expect(newNode.rank).toBeInstanceOf(Rank);
    expect(newNode.createdAt).toBeInstanceOf(Date);
    // Origin text truncated; new node carries the trailing text.
    const aNode = out.find((b) => b.id === "A")!;
    expect((aNode.data as { text: string }).text).toBe("hello");
    expect((newNode.data as { text: string }).text).toBe("world");
  });

  test("preserves timestamps from the matching prev row by id", () => {
    const blocks = [mk("A", null, a, { text: "abc" })];
    const overlay = buildOverlayOp(
      { kind: "split", blockId: "A", position: 1, newId: "NEW" },
      blocks,
    );
    const out = applyOverlayOp(blocks, overlay);
    const aNode = out.find((b) => b.id === "A")!;
    expect(aNode.createdAt).toEqual(blocks[0]!.createdAt);
  });
});

// ---------------------------------------------------------------------------
// Idempotency guard
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  test("applying the same split overlay op on a base that already has the newId throws", () => {
    const blocks = [mk("A", null, a, { text: "helloworld" })];
    const overlay = buildOverlayOp(
      { kind: "split", blockId: "A", position: 5, newId: "NEW" },
      blocks,
    );
    const once = applyOverlayOp(blocks, overlay);
    // Replaying the same op on the already-applied base ⇒ the effect is reflected
    // ⇒ guard throws OpNoLongerApplies (so the primitive's replay would drop it).
    expect(() => applyOverlayOp(once, overlay)).toThrow(OpNoLongerApplies);
  });
});

// ---------------------------------------------------------------------------
// Chained compose
// ---------------------------------------------------------------------------

describe("chained compose", () => {
  test("[split, outdent]: split dropped on a base that already absorbed it, outdent still applies", () => {
    // P with children C1, C2 — split C1, then outdent the new node.
    const r1 = a;
    const r2 = after(r1);
    const base = [
      mk("P", null, a, { expanded: true }),
      mk("C1", "P", r1, { text: "foobar" }),
      mk("C2", "P", r2),
    ];

    // Build the two overlay ops against the evolving optimistic state.
    const splitOp = buildOverlayOp(
      { kind: "split", blockId: "C1", position: 3, newId: "NEW" },
      base,
    );
    const afterSplit = applyOverlayOp(base, splitOp);
    const outdentOp = buildOverlayOp({ kind: "outdent", blockId: "NEW" }, afterSplit);

    // Simulate a base that already absorbed the split (server push landed):
    // re-running splitOp on it must drop (throw), while outdentOp still applies.
    expect(() => applyOverlayOp(afterSplit, splitOp)).toThrow(OpNoLongerApplies);

    const outdented = applyOverlayOp(afterSplit, outdentOp);
    const moved = outdented.find((b) => b.id === "NEW")!;
    // NEW outdented from under P up to the top level (P's parent is null).
    expect(moved.parentId).toBe(null);
  });

  test("buildOverlayOp captures the right effect + textOwners per kind", () => {
    const r1 = a;
    const r2 = after(r1);
    const rows = [mk("P1", null, r1, { text: "one" }), mk("P2", null, r2, { text: "two" })];

    const split = buildOverlayOp({ kind: "split", blockId: "P1", position: 1, newId: "S" }, rows);
    expect(split.effect).toEqual({ kind: "create", id: "S" });
    expect(split.textOwners).toEqual(["P1"]);

    const ins = buildOverlayOp({ kind: "insert", newId: "I", type: "text" }, rows);
    expect(ins.effect).toEqual({ kind: "create", id: "I" });
    expect(ins.textOwners).toEqual([]);

    // merge P2 into its prev sibling P1 ⇒ both are text owners.
    const merge = buildOverlayOp({ kind: "merge", blockId: "P2" }, rows);
    expect(merge.effect).toEqual({ kind: "remove", id: "P2" });
    expect(merge.textOwners).toEqual(["P2", "P1"]);

    const del = buildOverlayOp({ kind: "delete", blockId: "P1" }, rows);
    expect(del.effect).toEqual({ kind: "remove", id: "P1" });
    expect(del.textOwners).toEqual([]);

    const merged: BlockOverlayOp = merge;
    expect(merged.op.kind).toBe("merge");
  });
});
