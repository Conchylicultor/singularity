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
  applyPatch,
  buildOverlayOp,
  buildPatchOverlayOp,
  isPatchReflected,
  isReflected,
  sameOverlayTarget,
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
    const rank = String(blocks.find((b) => b.id === "B")!.rank);
    const move = { id: "B", parentId: null, rank };
    const e: OpEffect = { kind: "reparent", moves: [move] };
    expect(isReflected(blocks, e)).toBe(true);
    // Same parent, different rank ⇒ not yet reflected (a reorder is distinct).
    expect(
      isReflected(blocks, { kind: "reparent", moves: [{ ...move, rank: after(rank) }] }),
    ).toBe(false);
    // Different parent ⇒ not reflected.
    expect(
      isReflected(blocks, { kind: "reparent", moves: [{ ...move, parentId: "A" }] }),
    ).toBe(false);
  });

  test("reparent: every listed move must be reflected (a bulk indent/outdent)", () => {
    const rankA = String(blocks.find((b) => b.id === "A")!.rank);
    const rankB = String(blocks.find((b) => b.id === "B")!.rank);
    const both: OpEffect = {
      kind: "reparent",
      moves: [
        { id: "A", parentId: null, rank: rankA },
        { id: "B", parentId: null, rank: rankB },
      ],
    };
    expect(isReflected(blocks, both)).toBe(true);
    // One block still where it was ⇒ the whole op is not yet absorbed.
    expect(
      isReflected(blocks, {
        kind: "reparent",
        moves: [
          { id: "A", parentId: null, rank: rankA },
          { id: "B", parentId: "A", rank: rankB },
        ],
      }),
    ).toBe(false);
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
    // Origin text truncated; new node carries the trailing text (runs model).
    const aNode = out.find((b) => b.id === "A")!;
    expect((aNode.data as { text: unknown }).text).toEqual([{ text: "hello" }]);
    expect((newNode.data as { text: unknown }).text).toEqual([{ text: "world" }]);
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
    const outdentOp = buildOverlayOp({ kind: "outdent", blockIds: ["NEW"] }, afterSplit);

    // Simulate a base that already absorbed the split (server push landed):
    // re-running splitOp on it must drop (throw), while outdentOp still applies.
    expect(() => applyOverlayOp(afterSplit, splitOp)).toThrow(OpNoLongerApplies);

    const outdented = applyOverlayOp(afterSplit, outdentOp);
    const moved = outdented.find((b) => b.id === "NEW")!;
    // NEW outdented from under P up to the top level (P's parent is null).
    expect(moved.parentId).toBe(null);
  });

  test("buildOverlayOp captures the right effect per kind", () => {
    const r1 = a;
    const r2 = after(r1);
    const rows = [mk("P1", null, r1, { text: "one" }), mk("P2", null, r2, { text: "two" })];

    // `buildOverlayOp` always yields the `op`-tagged variant; assert + narrow.
    const expectOp = (v: BlockOverlayOp): Extract<BlockOverlayOp, { tag: "op" }> => {
      expect(v.tag).toBe("op");
      if (v.tag !== "op") throw new Error("expected op variant");
      return v;
    };

    const split = expectOp(buildOverlayOp({ kind: "split", blockId: "P1", position: 1, newId: "S" }, rows));
    expect(split.effect).toEqual({ kind: "create", id: "S" });

    const ins = expectOp(buildOverlayOp({ kind: "insert", newId: "I", type: "text" }, rows));
    expect(ins.effect).toEqual({ kind: "create", id: "I" });

    const merge = expectOp(buildOverlayOp({ kind: "merge", blockId: "P2" }, rows));
    expect(merge.effect).toEqual({ kind: "remove", id: "P2" });

    const del = expectOp(buildOverlayOp({ kind: "delete", blockId: "P1" }, rows));
    expect(del.effect).toEqual({ kind: "remove", id: "P1" });

    expect(merge.op.kind).toBe("merge");
  });
});

// ---------------------------------------------------------------------------
// Patch overlay (undo/redo inverse path)
// ---------------------------------------------------------------------------

describe("applyPatch", () => {
  test("upserts insert new + replace existing, deletes drop ids", () => {
    const blocks = [mk("A", null, a, { text: "a" }), mk("B", null, after(a), { text: "b" })];
    const out = applyPatch(blocks, {
      upserts: [mk("A", null, a, { text: "A!" }), mk("C", null, after(after(a)), { text: "c" })],
      deleteIds: ["B"],
    });
    expect(out.map((b) => b.id).sort()).toEqual(["A", "C"]);
    expect((out.find((b) => b.id === "A")!.data as { text: string }).text).toBe("A!");
  });

  test("deleting a subtree root drops descendants too (mirrors FK cascade)", () => {
    const blocks = [
      mk("P", null, a, { expanded: true }),
      mk("C1", "P", after(a)),
      mk("C2", "C1", after(after(a))),
    ];
    const out = applyPatch(blocks, { upserts: [], deleteIds: ["P"] });
    expect(out.length).toBe(0);
  });
});

describe("isPatchReflected", () => {
  test("true once every upsert is present + matching and every delete is gone", () => {
    const base = [mk("A", null, a, { type: "heading" })];
    const patch = { upserts: [mk("A", null, a, { type: "heading" })], deleteIds: ["B"] };
    expect(isPatchReflected(base, patch)).toBe(true);
    // An upsert whose column differs ⇒ not yet reflected.
    expect(isPatchReflected([mk("A", null, a, { type: "text" })], patch)).toBe(false);
    // A delete id still present ⇒ not reflected.
    expect(isPatchReflected([...base, mk("B", null, after(a))], patch)).toBe(false);
  });

  test("applyOverlayOp on a patch that the base already reflects throws", () => {
    const base = [mk("A", null, a)];
    const overlay = buildPatchOverlayOp({ upserts: [mk("A", null, a)], deleteIds: [] });
    expect(() => applyOverlayOp(base, overlay)).toThrow(OpNoLongerApplies);
  });
});

// ---------------------------------------------------------------------------
// Update-only patches (Stage 4a): the CRDT text projection's write mode. An
// update-only patch never CREATES rows — a debounced projection flush racing a
// concurrent delete (most importantly a history RESTORE, which replaces every
// content row) must never resurrect a deleted block with pre-delete text.
// These pin the client half; the server half is the symmetric insert-skip in
// handle-patch-blocks.ts.
// ---------------------------------------------------------------------------

describe("updateOnly patches", () => {
  const projected = {
    upserts: [mk("A", null, a, { text: "projected" })],
    deleteIds: [],
    updateOnly: true,
  };

  test("applyPatch updates a present row like a normal patch", () => {
    const out = applyPatch([mk("A", null, a, { text: "old" }), mk("B", null, after(a))], projected);
    expect(out.map((b) => b.id)).toEqual(["A", "B"]);
    expect((out.find((b) => b.id === "A")!.data as { text: string }).text).toBe("projected");
  });

  test("applyPatch NEVER re-creates an absent row (no resurrection)", () => {
    // Base without A — e.g. a restore replaced the page's rows.
    const out = applyPatch([mk("B", null, after(a))], projected);
    expect(out.map((b) => b.id)).toEqual(["B"]);
  });

  test("isPatchReflected treats an absent row as vacuously absorbed (confirms, never sticks)", () => {
    // Row gone from server truth: the server writer skipped the update, so the
    // op must confirm against this base instead of replaying forever.
    expect(isPatchReflected([mk("B", null, after(a))], projected)).toBe(true);
    // Same base, plain patch: NOT reflected (the row should have been created).
    expect(
      isPatchReflected([mk("B", null, after(a))], { ...projected, updateOnly: undefined }),
    ).toBe(false);
  });

  test("isPatchReflected still compares persisted columns for present rows", () => {
    const moved = {
      upserts: [mk("A", "B", a)],
      deleteIds: [],
      updateOnly: true,
    };
    expect(isPatchReflected([mk("A", null, a)], moved)).toBe(false);
    expect(isPatchReflected([mk("A", "B", a)], moved)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sameOverlayTarget (op identity for cascade confirmation)
// ---------------------------------------------------------------------------

describe("sameOverlayTarget", () => {
  const patchOn = (ids: string[], deleteIds: string[] = []): BlockOverlayOp =>
    buildPatchOverlayOp({ upserts: ids.map((id) => mk(id, null, a)), deleteIds });

  test("an undo patch and its redo inverse share their id set (the stuck-inverse pair cascades)", () => {
    const undoP = patchOn([], ["X"]); // undo: delete X
    const redoP = patchOn(["X"]); // redo: restore X
    expect(sameOverlayTarget(undoP, redoP)).toBe(true);
  });

  test("patches on disjoint blocks are unrelated (a projectText on another block never cascades)", () => {
    expect(sameOverlayTarget(patchOn(["A"]), patchOn(["B"]))).toBe(false);
    expect(sameOverlayTarget(patchOn([], ["A"]), patchOn(["B"], ["C"]))).toBe(false);
  });

  test("structural ops target the rows the BlockOp names", () => {
    const rows = [mk("A", null, a), mk("B", null, after(a))];
    const split = buildOverlayOp(
      { kind: "split", blockId: "A", position: 1, newId: "NEW" },
      rows,
    );
    const del = buildOverlayOp({ kind: "delete", blockId: "A" }, rows);
    const other = buildOverlayOp({ kind: "delete", blockId: "B" }, rows);
    expect(sameOverlayTarget(split, del)).toBe(true); // both touch A
    expect(sameOverlayTarget(split, other)).toBe(false);
    // op ↔ patch across the same row
    expect(sameOverlayTarget(del, patchOn(["A"]))).toBe(true);
    expect(sameOverlayTarget(del, patchOn(["B"]))).toBe(false);
  });
});
