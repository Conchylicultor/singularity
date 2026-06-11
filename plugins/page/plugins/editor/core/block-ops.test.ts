/**
 * Pure unit tests for the block-tree reducer (`applyBlockOp`).
 * Run with `bun test plugins/page/plugins/editor/`.
 *
 * The server only diffs + persists; all tree/rank math lives here. These tests
 * exercise the load-bearing invariants (Notion-style outdent reparenting, split
 * as-child, merge child adoption, subtree delete, move cycle guard) plus the
 * structural invariants every op must hold: strictly-ascending rank ordering
 * per parent, pageId never changes for a surviving node, and the input array is
 * never mutated.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { PAGE_BLOCK_TYPE } from "./schemas";
import {
  applyBlockOp,
  childrenOf,
  textOf,
  type BlockNode,
  type BlockOp,
} from "./block-ops";

// ---------------------------------------------------------------------------
// Test factory + invariant helpers
// ---------------------------------------------------------------------------

/**
 * Build a `BlockNode`. `rank` is required and must be a fractional-indexing key
 * (use `key("a0")`, etc. — passing readable letters keeps the ordering obvious).
 */
function mk(
  id: string,
  parentId: string | null,
  rank: string,
  opts: { text?: string; expanded?: boolean; type?: string; pageId?: string | null } = {},
): BlockNode {
  return {
    id,
    pageId: opts.pageId === undefined ? "page-1" : opts.pageId,
    parentId,
    type: opts.type ?? "text",
    data: { text: opts.text ?? id },
    rank,
    expanded: opts.expanded ?? false,
  };
}

/** A few stable, ascending rank keys for readable fixtures. */
const a = Rank.between(null, null).toJSON(); // first key
function after(prev: string): string {
  return Rank.between(Rank.from(prev), null).toJSON();
}

/** Assert ranks are strictly ascending within every parent group. */
function assertRankOrdering(blocks: BlockNode[]): void {
  const byParent = new Map<string | null, BlockNode[]>();
  for (const b of blocks) {
    const list = byParent.get(b.parentId) ?? [];
    list.push(b);
    byParent.set(b.parentId, list);
  }
  for (const list of byParent.values()) {
    const sorted = childrenOf(blocks, list[0]!.parentId);
    for (let i = 1; i < sorted.length; i++) {
      expect(Rank.compare(Rank.from(sorted[i - 1]!.rank), Rank.from(sorted[i]!.rank))).toBe(-1);
    }
  }
}

/** pageId of every surviving node is unchanged vs the before snapshot. */
function assertPageIdInvariant(before: BlockNode[], after: BlockNode[]): void {
  const beforeById = new Map(before.map((b) => [b.id, b.pageId]));
  for (const node of after) {
    if (beforeById.has(node.id)) {
      expect(node.pageId).toBe(beforeById.get(node.id)!);
    }
  }
}

/**
 * Run an op and assert the universal invariants: input frozen + deep-equal
 * after (not mutated), rank ordering strictly ascending, pageId preserved.
 * Returns the result for op-specific assertions.
 */
function run(blocks: BlockNode[], op: BlockOp): BlockNode[] {
  const snapshot = structuredClone(blocks);
  Object.freeze(blocks);
  blocks.forEach((b) => Object.freeze(b));
  const result = applyBlockOp(blocks, op);
  // Input not mutated.
  expect(blocks).toEqual(snapshot);
  assertRankOrdering(result);
  assertPageIdInvariant(snapshot, result);
  return result;
}

function ids(blocks: BlockNode[], parentId: string | null): string[] {
  return childrenOf(blocks, parentId).map((b) => b.id);
}

// ---------------------------------------------------------------------------
// outdent
// ---------------------------------------------------------------------------

describe("outdent", () => {
  test("reparents the FOLLOWING siblings as its children, order preserved + expanded set", () => {
    // parent P with children C1, C2(target), C3, C4 — outdent C2.
    const r1 = a;
    const r2 = after(r1);
    const r3 = after(r2);
    const r4 = after(r3);
    const blocks = [
      mk("P", null, a),
      mk("C1", "P", r1),
      mk("C2", "P", r2, { expanded: false }),
      mk("C3", "P", r3),
      mk("C4", "P", r4),
    ];
    const out = run(blocks, { kind: "outdent", blockId: "C2" });

    // C2 became a top-level sibling immediately after P.
    const c2 = out.find((b) => b.id === "C2")!;
    expect(c2.parentId).toBe(null);
    // It sits between P and (P's next sibling — none) at the top level.
    expect(ids(out, null)).toEqual(["P", "C2"]);
    // Followers C3, C4 are now C2's children, in order.
    expect(ids(out, "C2")).toEqual(["C3", "C4"]);
    // C1 stays under P.
    expect(ids(out, "P")).toEqual(["C1"]);
    // C2 forced open because it gained children.
    expect(c2.expanded).toBe(true);
  });

  test("first child with no followers: moves up, gains no children, expanded unchanged", () => {
    const r1 = a;
    const blocks = [mk("P", null, a), mk("C1", "P", r1, { expanded: false })];
    const out = run(blocks, { kind: "outdent", blockId: "C1" });
    const c1 = out.find((b) => b.id === "C1")!;
    expect(c1.parentId).toBe(null);
    expect(ids(out, "C1")).toEqual([]);
    expect(c1.expanded).toBe(false);
    expect(ids(out, null)).toEqual(["P", "C1"]);
  });

  test("middle child keeps its place and adopts only the followers after it", () => {
    const r1 = a;
    const r2 = after(r1);
    const r3 = after(r2);
    const blocks = [
      mk("P", null, a),
      mk("C1", "P", r1),
      mk("C2", "P", r2),
      mk("C3", "P", r3),
    ];
    const out = run(blocks, { kind: "outdent", blockId: "C2" });
    expect(ids(out, "P")).toEqual(["C1"]);
    expect(ids(out, "C2")).toEqual(["C3"]);
    expect(ids(out, null)).toEqual(["P", "C2"]);
  });

  test("appends followers AFTER the block's existing children, order preserved", () => {
    const r1 = a;
    const r2 = after(r1); // target C
    const r3 = after(r2); // follower F1
    const r4 = after(r3); // follower F2
    const k1 = a;
    const k2 = after(k1);
    const blocks = [
      mk("P", null, a),
      mk("C1", "P", r1),
      mk("C", "P", r2, { expanded: true }),
      mk("F1", "P", r3),
      mk("F2", "P", r4),
      mk("K1", "C", k1),
      mk("K2", "C", k2),
    ];
    const out = run(blocks, { kind: "outdent", blockId: "C" });
    // Existing kids first, then followers in order.
    expect(ids(out, "C")).toEqual(["K1", "K2", "F1", "F2"]);
  });

  test("at top level → no-op", () => {
    const blocks = [mk("T", null, a)];
    const out = run(blocks, { kind: "outdent", blockId: "T" });
    expect(out).toEqual(blocks);
  });

  test("under a page block → no-op", () => {
    const blocks = [
      mk("PG", null, a, { type: PAGE_BLOCK_TYPE }),
      mk("C", "PG", a),
    ];
    const out = run(blocks, { kind: "outdent", blockId: "C" });
    expect(out).toEqual(blocks);
  });
});

// ---------------------------------------------------------------------------
// split
// ---------------------------------------------------------------------------

describe("split", () => {
  test("at end with expanded children (asChild) → new block is the FIRST child", () => {
    const k1 = a;
    const blocks = [
      mk("B", null, a, { text: "hello", expanded: true }),
      mk("K1", "B", k1, { text: "child" }),
    ];
    const out = run(blocks, {
      kind: "split",
      blockId: "B",
      position: 5,
      newId: "NEW",
      asChild: true,
    });
    const b = out.find((x) => x.id === "B")!;
    const newNode = out.find((x) => x.id === "NEW")!;
    expect(textOf(b)).toBe("hello");
    expect(textOf(newNode)).toBe(""); // after-text empty (split at end)
    expect(b.expanded).toBe(true);
    expect(newNode.parentId).toBe("B");
    // NEW is the first child, before K1.
    expect(ids(out, "B")).toEqual(["NEW", "K1"]);
    expect(newNode.pageId).toBe(b.pageId);
    expect(newNode.expanded).toBe(false);
  });

  test("mid-text → sibling carrying trailing text", () => {
    const r1 = a;
    const r2 = after(r1);
    const blocks = [
      mk("A", null, r1, { text: "helloworld" }),
      mk("B", null, r2, { text: "next" }),
    ];
    const out = run(blocks, { kind: "split", blockId: "A", position: 5, newId: "NEW" });
    const aNode = out.find((x) => x.id === "A")!;
    const newNode = out.find((x) => x.id === "NEW")!;
    expect(textOf(aNode)).toBe("hello");
    expect(textOf(newNode)).toBe("world");
    expect(newNode.parentId).toBe(null);
    // NEW sits between A and B.
    expect(ids(out, null)).toEqual(["A", "NEW", "B"]);
    expect(newNode.type).toBe("text");
  });

  test("no next sibling → new sibling appended at end", () => {
    const blocks = [mk("A", null, a, { text: "abcdef" })];
    const out = run(blocks, { kind: "split", blockId: "A", position: 3, newId: "NEW" });
    expect(ids(out, null)).toEqual(["A", "NEW"]);
    const newNode = out.find((x) => x.id === "NEW")!;
    expect(textOf(newNode)).toBe("def");
  });
});

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------

describe("merge", () => {
  test("concatenates text into prev and adopts the block's children", () => {
    const r1 = a;
    const r2 = after(r1);
    const pk = a; // prev's existing child
    const ck1 = a; // block's children
    const ck2 = after(ck1);
    const blocks = [
      mk("PREV", null, r1, { text: "foo" }),
      mk("CUR", null, r2, { text: "bar" }),
      mk("PK", "PREV", pk, { text: "prevkid" }),
      mk("CK1", "CUR", ck1),
      mk("CK2", "CUR", ck2),
    ];
    const out = run(blocks, { kind: "merge", blockId: "CUR" });
    const prev = out.find((b) => b.id === "PREV")!;
    expect(textOf(prev)).toBe("foobar");
    expect(prev.expanded).toBe(true);
    // CUR removed.
    expect(out.find((b) => b.id === "CUR")).toBeUndefined();
    // Adopted children appended after prev's existing child, in order.
    expect(ids(out, "PREV")).toEqual(["PK", "CK1", "CK2"]);
  });

  test("no prev sibling → no-op", () => {
    const blocks = [mk("ONLY", null, a, { text: "x" })];
    const out = run(blocks, { kind: "merge", blockId: "ONLY" });
    expect(out).toEqual(blocks);
  });
});

// ---------------------------------------------------------------------------
// indent
// ---------------------------------------------------------------------------

describe("indent", () => {
  test("reparents block under its prev sibling and opens prev", () => {
    const r1 = a;
    const r2 = after(r1);
    const pk = a;
    const blocks = [
      mk("PREV", null, r1, { expanded: false }),
      mk("CUR", null, r2),
      mk("PK", "PREV", pk),
    ];
    const out = run(blocks, { kind: "indent", blockId: "CUR" });
    const prev = out.find((b) => b.id === "PREV")!;
    const cur = out.find((b) => b.id === "CUR")!;
    expect(cur.parentId).toBe("PREV");
    expect(prev.expanded).toBe(true);
    // CUR appended after PREV's existing child.
    expect(ids(out, "PREV")).toEqual(["PK", "CUR"]);
    expect(ids(out, null)).toEqual(["PREV"]);
  });

  test("no prev sibling → no-op", () => {
    const blocks = [mk("FIRST", null, a)];
    const out = run(blocks, { kind: "indent", blockId: "FIRST" });
    expect(out).toEqual(blocks);
  });
});

// ---------------------------------------------------------------------------
// insert
// ---------------------------------------------------------------------------

describe("insert", () => {
  test("afterId → inserts between target and its next sibling, inherits parent", () => {
    const r1 = a;
    const r2 = after(r1);
    const blocks = [mk("A", null, r1), mk("B", null, r2)];
    const out = run(blocks, { kind: "insert", newId: "NEW", type: "text", afterId: "A" });
    expect(ids(out, null)).toEqual(["A", "NEW", "B"]);
    const newNode = out.find((b) => b.id === "NEW")!;
    expect(newNode.parentId).toBe(null);
    expect(newNode.expanded).toBe(false);
  });

  test("append under parentId → after the last child, opens parent", () => {
    const k1 = a;
    const blocks = [
      mk("P", null, a, { expanded: false }),
      mk("K1", "P", k1),
    ];
    const out = run(blocks, { kind: "insert", newId: "NEW", type: "text", parentId: "P" });
    expect(ids(out, "P")).toEqual(["K1", "NEW"]);
    const parent = out.find((b) => b.id === "P")!;
    expect(parent.expanded).toBe(true);
    const newNode = out.find((b) => b.id === "NEW")!;
    expect(newNode.pageId).toBe(parent.pageId);
  });

  test("append at top level (no parent, no afterId)", () => {
    const blocks = [mk("A", null, a)];
    const out = run(blocks, { kind: "insert", newId: "NEW", type: "text" });
    expect(ids(out, null)).toEqual(["A", "NEW"]);
    expect(out.find((b) => b.id === "NEW")!.pageId).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe("delete", () => {
  test("removes the block and its full subtree", () => {
    const k1 = a;
    const gk = a;
    const blocks = [
      mk("ROOT", null, a),
      mk("K1", "ROOT", k1),
      mk("GK", "K1", gk),
      mk("OTHER", null, after(a)),
    ];
    const out = run(blocks, { kind: "delete", blockId: "ROOT" });
    expect(out.map((b) => b.id).sort()).toEqual(["OTHER"]);
  });
});

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

describe("move", () => {
  test("in-page move sets parentId/rank and opens the new parent", () => {
    const r1 = a;
    const r2 = after(r1);
    const blocks = [
      mk("A", null, r1, { expanded: false }),
      mk("B", null, r2),
    ];
    const newRank = Rank.between(null, null).toJSON();
    const out = run(blocks, { kind: "move", blockId: "B", parentId: "A", rank: newRank });
    const b = out.find((x) => x.id === "B")!;
    expect(b.parentId).toBe("A");
    expect(b.rank).toBe(newRank);
    expect(out.find((x) => x.id === "A")!.expanded).toBe(true);
  });

  test("cycle guard: moving a block under its own descendant → no-op", () => {
    const k1 = a;
    const blocks = [
      mk("A", null, a),
      mk("CHILD", "A", k1),
    ];
    // Try to move A under CHILD (its own descendant).
    const out = run(blocks, { kind: "move", blockId: "A", parentId: "CHILD", rank: a });
    expect(out).toEqual(blocks);
  });
});
