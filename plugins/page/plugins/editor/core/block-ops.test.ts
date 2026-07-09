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
  prevVisibleLeaf,
  runsOfNode,
  textOf,
  type BlockNode,
  type BlockOp,
} from "./block-ops";
import type { RichText } from "./rich-text";

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

  test("siblingType overrides the new sibling's type (heading → text)", () => {
    const blocks = [mk("H", null, a, { text: "Title", type: "heading-1" })];
    const out = run(blocks, {
      kind: "split",
      blockId: "H",
      position: 5,
      newId: "NEW",
      siblingType: "text",
    });
    const newNode = out.find((x) => x.id === "NEW")!;
    // The origin keeps its heading type; the new sibling becomes a body paragraph.
    expect(out.find((x) => x.id === "H")!.type).toBe("heading-1");
    expect(newNode.type).toBe("text");
  });

  test("without siblingType the new sibling keeps the original type", () => {
    const blocks = [mk("H", null, a, { text: "Title", type: "heading-1" })];
    const out = run(blocks, { kind: "split", blockId: "H", position: 5, newId: "NEW" });
    expect(out.find((x) => x.id === "NEW")!.type).toBe("heading-1");
  });
});

// ---------------------------------------------------------------------------
// prevVisibleLeaf
// ---------------------------------------------------------------------------

describe("prevVisibleLeaf", () => {
  test("descends to the deepest last expanded child of the prev sibling", () => {
    // xx (expanded) ├ yy0 └ yy1 ; zz follows xx. zz's prev visible leaf is yy1.
    const r1 = a;
    const r2 = after(r1);
    const k1 = a;
    const k2 = after(k1);
    const blocks = [
      mk("xx", null, r1, { expanded: true }),
      mk("zz", null, r2),
      mk("yy0", "xx", k1),
      mk("yy1", "xx", k2),
    ];
    const leaf = prevVisibleLeaf(blocks, blocks.find((b) => b.id === "zz")!);
    expect(leaf?.id).toBe("yy1");
  });

  test("stops at a collapsed parent (its children aren't visible)", () => {
    // xx is COLLAPSED → its children are hidden, so the leaf is xx itself.
    const r1 = a;
    const r2 = after(r1);
    const k1 = a;
    const blocks = [
      mk("xx", null, r1, { expanded: false }),
      mk("zz", null, r2),
      mk("yy0", "xx", k1),
    ];
    const leaf = prevVisibleLeaf(blocks, blocks.find((b) => b.id === "zz")!);
    expect(leaf?.id).toBe("xx");
  });

  test("no previous sibling → null", () => {
    const r1 = a;
    const blocks = [mk("first", null, r1)];
    expect(prevVisibleLeaf(blocks, blocks[0]!)).toBe(null);
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

  test("merges into the previous VISIBLE leaf, not the immediate sibling", () => {
    // xx (expanded) ├ yy0 └ yy1 ; zz (with its own child zk) follows xx.
    // Backspace at zz must merge into yy1 (the last visible block), adopting
    // zz's child under yy1 — NOT into xx.
    const r1 = a;
    const r2 = after(r1);
    const k1 = a;
    const k2 = after(k1);
    const zk = a;
    const blocks = [
      mk("xx", null, r1, { text: "xx", expanded: true }),
      mk("zz", null, r2, { text: "zz", expanded: true }),
      mk("yy0", "xx", k1, { text: "yy0" }),
      mk("yy1", "xx", k2, { text: "yy1" }),
      mk("zk", "zz", zk, { text: "zk" }),
    ];
    const out = run(blocks, { kind: "merge", blockId: "zz" });
    // Text joined into yy1; xx untouched.
    expect(textOf(out.find((b) => b.id === "yy1")!)).toBe("yy1zz");
    expect(textOf(out.find((b) => b.id === "xx")!)).toBe("xx");
    // zz removed; its child zk adopted under yy1.
    expect(out.find((b) => b.id === "zz")).toBeUndefined();
    expect(ids(out, "yy1")).toEqual(["zk"]);
    // yy1 forced open because it gained a child.
    expect(out.find((b) => b.id === "yy1")!.expanded).toBe(true);
  });

  test("no prev sibling → no-op", () => {
    const blocks = [mk("ONLY", null, a, { text: "x" })];
    const out = run(blocks, { kind: "merge", blockId: "ONLY" });
    expect(out).toEqual(blocks);
  });
});

// ---------------------------------------------------------------------------
// rich-text runs round-trip through split / merge
// ---------------------------------------------------------------------------

describe("rich-text runs", () => {
  test("split preserves marks/color on both sides, dividing the straddling run", () => {
    const runs: RichText = [
      { text: "foo", marks: ["bold"] },
      { text: "barbaz", color: "red" },
    ];
    const blocks: BlockNode[] = [
      { id: "A", pageId: "page-1", parentId: null, type: "text", data: { text: runs }, rank: a, expanded: false },
    ];
    const out = run(blocks, { kind: "split", blockId: "A", position: 5, newId: "NEW" });
    // "foo"(bold) + "ba"(red) | "rbaz"(red)
    expect(runsOfNode(out.find((b) => b.id === "A")!)).toEqual([
      { text: "foo", marks: ["bold"] },
      { text: "ba", color: "red" },
    ]);
    expect(runsOfNode(out.find((b) => b.id === "NEW")!)).toEqual([
      { text: "rbaz", color: "red" },
    ]);
  });

  test("op.runs authoritative payload overrides stored data", () => {
    const blocks = [mk("A", null, a, { text: "stale" })];
    const liveRuns: RichText = [{ text: "live", marks: ["italic"] }];
    const out = run(blocks, { kind: "split", blockId: "A", position: 2, newId: "NEW", runs: liveRuns });
    expect(runsOfNode(out.find((b) => b.id === "A")!)).toEqual([{ text: "li", marks: ["italic"] }]);
    expect(runsOfNode(out.find((b) => b.id === "NEW")!)).toEqual([{ text: "ve", marks: ["italic"] }]);
  });

  test("merge concatenates runs and coalesces the seam", () => {
    const prevRuns: RichText = [{ text: "foo", marks: ["bold"] }];
    const curRuns: RichText = [{ text: "bar", marks: ["bold"] }];
    const r1 = a;
    const r2 = after(r1);
    const blocks: BlockNode[] = [
      { id: "PREV", pageId: "page-1", parentId: null, type: "text", data: { text: prevRuns }, rank: r1, expanded: false },
      { id: "CUR", pageId: "page-1", parentId: null, type: "text", data: { text: curRuns }, rank: r2, expanded: false },
    ];
    const out = run(blocks, { kind: "merge", blockId: "CUR" });
    // Same marks ⇒ one coalesced run.
    expect(runsOfNode(out.find((b) => b.id === "PREV")!)).toEqual([{ text: "foobar", marks: ["bold"] }]);
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

  test("beforeId → inserts between target and its previous sibling, inherits parent", () => {
    const r1 = a;
    const r2 = after(r1);
    const blocks = [mk("A", null, r1), mk("B", null, r2)];
    const out = run(blocks, { kind: "insert", newId: "NEW", type: "text", beforeId: "B" });
    expect(ids(out, null)).toEqual(["A", "NEW", "B"]);
    expect(out.find((b) => b.id === "NEW")!.parentId).toBe(null);
  });

  test("beforeId on the first sibling → becomes the new first child", () => {
    const blocks = [mk("A", "PAGE", a, { pageId: "PAGE" })];
    const out = run(blocks, { kind: "insert", newId: "NEW", type: "text", beforeId: "A" });
    expect(ids(out, "PAGE")).toEqual(["NEW", "A"]);
    expect(out.find((b) => b.id === "NEW")!.pageId).toBe("PAGE");
  });

  test("afterId wins over beforeId", () => {
    const r1 = a;
    const r2 = after(r1);
    const blocks = [mk("A", null, r1), mk("B", null, r2)];
    const out = run(blocks, {
      kind: "insert",
      newId: "NEW",
      type: "text",
      afterId: "B",
      beforeId: "A",
    });
    expect(ids(out, null)).toEqual(["A", "B", "NEW"]);
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

  test("append under the page row (excluded from the content forest) → pageId is the page id, not null", () => {
    // The reducer runs over `loadPageBlocks(pageId)` — the page's content blocks,
    // which does NOT include the page row itself. A top-level insert is parented
    // to that absent page row, so the new block's nearest page ancestor is the
    // parentId. Using `parent.pageId` (parent not found → null) hid the block
    // from the page-scoped query on reload.
    const blocks = [mk("A", "PAGE", a, { pageId: "PAGE" })];
    const out = run(blocks, { kind: "insert", newId: "NEW", type: "text", parentId: "PAGE" });
    expect(out.find((b) => b.id === "NEW")!.pageId).toBe("PAGE");
  });

  test("append under an in-forest sub-page node → pageId is that sub-page's id", () => {
    // A sub-page (type="page") nested inside this page IS in the forest; its
    // children are scoped to the sub-page itself (parent.id), mirroring
    // computePageId / insertForest.
    const blocks = [mk("SUB", null, a, { type: "page", pageId: "PAGE" })];
    const out = run(blocks, { kind: "insert", newId: "NEW", type: "text", parentId: "SUB" });
    expect(out.find((b) => b.id === "NEW")!.pageId).toBe("SUB");
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

// ---------------------------------------------------------------------------
// Sub-pages inline: page rows are members of the content forest
// ---------------------------------------------------------------------------

/**
 * `blocksLiveResource` no longer filters `type <> 'page'`, so the client's
 * reducer sees exactly the forest the server's has always seen: every block
 * whose nearest page ancestor is this page, sub-page rows included. Two
 * consequences are load-bearing.
 *
 *  1. `(parent_id, rank)` is ONE complete ordering space. A minted rank must
 *     never collide with a rank already live under the same parent — a duplicate
 *     is precisely the state that makes the next `Rank.between` of that pair
 *     throw (`a0 >= a0`).
 *  2. A sub-page row is a LEAF of this forest: its own content lives under a
 *     different `page_id`. `split`/`merge`/`indent` therefore treat it as an
 *     illegal target, not a conditionally-handled one — reparenting or
 *     text-merging across the boundary would strand rows whose `parent_id` and
 *     `page_id` disagree, unreachable by any page-scoped query. The reducer
 *     upholds the in-page invariant (it never restamps `pageId`), so the only
 *     correct answer is a no-op.
 */

/** The page whose content forest these fixtures describe. Never a member of it. */
const PAGE = "PAGE";

function content(id: string, parentId: string, rank: string, text?: string): BlockNode {
  return mk(id, parentId, rank, { text: text ?? id, expanded: true, pageId: PAGE });
}

function subPage(id: string, parentId: string, rank: string): BlockNode {
  return {
    ...mk(id, parentId, rank, { expanded: true, pageId: PAGE, type: PAGE_BLOCK_TYPE }),
    data: { title: id, icon: null },
  };
}

describe("page rows — split", () => {
  // Under PAGE: T1 (text), S1 (sub-page), T2 (text). The sub-page sits exactly
  // in the gap a split of T1 mints into — a neighbour the editor could not see
  // before, and whose rank it therefore used to ignore.
  const forest = (): BlockNode[] => {
    const r1 = a;
    const r2 = after(r1);
    const r3 = after(r2);
    return [content("T1", PAGE, r1, "helloworld"), subPage("S1", PAGE, r2), content("T2", PAGE, r3)];
  };

  test("splitting a text block whose next sibling is a page row mints a rank strictly inside the gap", () => {
    const blocks = forest();
    const out = run(blocks, { kind: "split", blockId: "T1", position: 5, newId: "NEW" });

    // `run` already asserts strictly-ascending (⇒ distinct) sibling ranks.
    expect(ids(out, PAGE)).toEqual(["T1", "NEW", "S1", "T2"]);
    const minted = out.find((b) => b.id === "NEW")!;
    const s1 = out.find((b) => b.id === "S1")!;
    expect(Rank.compare(Rank.from(minted.rank), Rank.from(s1.rank))).toBe(-1);
    expect(minted.rank).not.toBe(s1.rank);
  });

  test("splitting a page row → no-op", () => {
    const blocks = forest();
    const out = run(blocks, { kind: "split", blockId: "S1", position: 0, newId: "NEW" });
    expect(out).toEqual(blocks);
  });

  test("splitting a page row asChild → no-op (never seeds into the sub-page's partition)", () => {
    const blocks = forest();
    const out = run(blocks, {
      kind: "split",
      blockId: "S1",
      position: 0,
      newId: "NEW",
      asChild: true,
      childType: "text",
    });
    expect(out).toEqual(blocks);
    expect(ids(out, "S1")).toEqual([]);
  });
});

describe("page rows — indent", () => {
  test("indenting a block whose previous sibling is a page row → no-op", () => {
    const r1 = a;
    const r2 = after(r1);
    const r3 = after(r2);
    const blocks = [content("T1", PAGE, r1), subPage("S1", PAGE, r2), content("T2", PAGE, r3)];
    const out = run(blocks, { kind: "indent", blockId: "T2" });
    expect(out).toEqual(blocks);
    expect(ids(out, "S1")).toEqual([]);
  });

  test("indenting under a text previous sibling still works (the guard is targeted)", () => {
    const r1 = a;
    const r2 = after(r1);
    const r3 = after(r2);
    const blocks = [content("T1", PAGE, r1), content("T2", PAGE, r2), subPage("S1", PAGE, r3)];
    const out = run(blocks, { kind: "indent", blockId: "T2" });
    expect(out.find((b) => b.id === "T2")!.parentId).toBe("T1");
    expect(ids(out, PAGE)).toEqual(["T1", "S1"]);
  });

  test("indenting a page row under a text sibling is allowed (the sub-page just nests)", () => {
    // Legal: the sub-page's own `pageId` (the outer page) is unchanged, and its
    // content lives in a different partition either way. Only the reverse —
    // nesting content INTO a page row — is forbidden.
    const r1 = a;
    const r2 = after(r1);
    const blocks = [content("T1", PAGE, r1), subPage("S1", PAGE, r2)];
    const out = run(blocks, { kind: "indent", blockId: "S1" });
    expect(out.find((b) => b.id === "S1")!.parentId).toBe("T1");
  });
});

describe("page rows — merge", () => {
  test("merging into a previous page row → no-op, and the page keeps its PageData payload", () => {
    const r1 = a;
    const r2 = after(r1);
    const blocks = [subPage("S1", PAGE, r1), content("T1", PAGE, r2, "tail")];
    const out = run(blocks, { kind: "merge", blockId: "T1" });
    expect(out).toEqual(blocks);
    // No bogus `data.text` written onto a PageDataSchema-shaped payload.
    expect(out.find((b) => b.id === "S1")!.data).toEqual({ title: "S1", icon: null });
  });

  test("the page row is caught as prevVisibleLeaf, not merely as prevSibling", () => {
    // T1's previous sibling is T0, whose deepest last expanded descendant is the
    // sub-page S1. The guard must inspect the LEAF the caret would land on.
    const r1 = a;
    const r2 = after(r1);
    const blocks = [content("T0", PAGE, r1), subPage("S1", "T0", a), content("T1", PAGE, r2, "tail")];
    const out = run(blocks, { kind: "merge", blockId: "T1" });
    expect(out).toEqual(blocks);
  });

  test("merging a page row away → no-op (a keystroke must not delete a sub-page)", () => {
    // Symmetric to the split guard: `merge` REMOVES the merged block, which for
    // a page row would FK-cascade its entire content away.
    const r1 = a;
    const r2 = after(r1);
    const blocks = [content("T1", PAGE, r1), subPage("S1", PAGE, r2)];
    const out = run(blocks, { kind: "merge", blockId: "S1" });
    expect(out).toEqual(blocks);
  });

  test("merging into a previous text leaf still works, children adopted", () => {
    const r1 = a;
    const r2 = after(r1);
    const blocks = [
      content("T1", PAGE, r1, "head"),
      content("T2", PAGE, r2, "tail"),
      content("C1", "T2", a, "child"),
    ];
    const out = run(blocks, { kind: "merge", blockId: "T2" });
    expect(out.find((b) => b.id === "T2")).toBeUndefined();
    expect(ids(out, "T1")).toEqual(["C1"]);
    expect(textOf(out.find((b) => b.id === "T1")!)).toBe("headtail");
  });
});

// ---------------------------------------------------------------------------
// Property tests over random forests containing page rows
// ---------------------------------------------------------------------------

// Deterministic PRNG (mulberry32) so a fuzz failure is reproducible from its
// seed — `Math.random()` would make a red run impossible to replay. Mirrors
// `plugins/primitives/plugins/tree/core/internal/tree.test.ts`.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random content forest rooted at the (absent) page row `PAGE`, with valid
 * acyclic parent links and sibling-unique ranks. Page rows are emitted as leaves
 * — never chosen as a parent — because that is exactly what the `page_id`
 * partition guarantees about `loadPageBlocks`.
 */
function randomForest(rand: () => number, n: number): BlockNode[] {
  const rows: BlockNode[] = [];
  const lastRankUnder = new Map<string, Rank | null>();
  const contentIds: string[] = []; // only content blocks may parent

  for (let i = 0; i < n; i++) {
    const id = `n${i}`;
    const parentId =
      contentIds.length > 0 && rand() < 0.6
        ? contentIds[Math.floor(rand() * contentIds.length)]!
        : PAGE;
    const rank = Rank.between(lastRankUnder.get(parentId) ?? null, null);
    lastRankUnder.set(parentId, rank);

    if (rand() < 0.3) {
      rows.push({ ...subPage(id, parentId, rank.toJSON()), expanded: rand() < 0.5 });
    } else {
      contentIds.push(id);
      rows.push({ ...content(id, parentId, rank.toJSON()), expanded: rand() < 0.8 });
    }
  }
  return rows;
}

/** Ids of every page row's children, as a `pageRowId -> childIds` map. */
function pageRowChildren(blocks: BlockNode[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const b of blocks) {
    if (b.type !== PAGE_BLOCK_TYPE) continue;
    out.set(b.id, blocks.filter((c) => c.parentId === b.id).map((c) => c.id).sort());
  }
  return out;
}

/** One op of every kind, instantiated against a random node of `rows`. */
function randomOp(rand: () => number, rows: BlockNode[], nonce: number): BlockOp {
  const kinds = ["split", "merge", "indent", "outdent", "insert", "delete", "move"] as const;
  const kind = kinds[Math.floor(rand() * kinds.length)]!;
  const target = rows[Math.floor(rand() * rows.length)]!;
  const newId = `x${nonce}`;

  switch (kind) {
    case "split":
      return { kind: "split", blockId: target.id, position: Math.floor(rand() * 4), newId };
    case "merge":
      return { kind: "merge", blockId: target.id };
    case "indent":
      return { kind: "indent", blockId: target.id };
    case "outdent":
      return { kind: "outdent", blockId: target.id };
    case "delete":
      return { kind: "delete", blockId: target.id };
    case "insert":
      return rand() < 0.5
        ? { kind: "insert", newId, type: "text", data: { text: "" }, afterId: target.id }
        : { kind: "insert", newId, type: "text", data: { text: "" }, parentId: target.id };
    case "move": {
      // The caller mints the rank against the destination's TRUE sibling set —
      // the whole point of the one-forest change. Page rows are not destinations
      // (a move into a sub-page is a cross-partition op the server recomputes).
      const dest =
        target.type === PAGE_BLOCK_TYPE || rand() < 0.3 ? PAGE : target.id;
      const kids = childrenOf(rows, dest);
      const last = kids.length > 0 ? Rank.from(kids[kids.length - 1]!.rank) : null;
      const moved = rows[Math.floor(rand() * rows.length)]!;
      return {
        kind: "move",
        blockId: moved.id,
        parentId: dest,
        rank: Rank.between(last, null).toJSON(),
      };
    }
  }
}

describe("page rows — property (no minted rank collides with a live sibling)", () => {
  test("every op kind over a page-row-bearing forest leaves sibling ranks strictly ascending", () => {
    let applied = 0;
    let noOps = 0;

    for (let seed = 1; seed <= 3000; seed++) {
      const rand = rng(seed);
      const rows = randomForest(rand, 3 + Math.floor(rand() * 18));
      assertRankOrdering(rows); // the generator itself never mints a collision

      const before = structuredClone(rows);
      const next = applyBlockOp(rows, randomOp(rand, rows, seed));
      if (next === rows) noOps++;
      else applied++;

      // The load-bearing invariant: no minted rank equals a rank concurrently
      // live under the same parent — for EVERY op kind.
      assertRankOrdering(next);
      // pageId is never rewritten for a surviving node (the in-page invariant).
      assertPageIdInvariant(before, next);
      // The reducer never mutates its input.
      expect(rows).toEqual(before);
    }

    // Non-vacuity floor: the fuzz exercised both real applications and guards.
    expect(applied).toBeGreaterThan(500);
    expect(noOps).toBeGreaterThan(50);
  });

  test("split/merge/indent no-op exactly when a page row is the target, and page rows stay leaves", () => {
    let splitGuarded = 0;
    let mergeGuarded = 0;
    let indentGuarded = 0;

    for (let seed = 1; seed <= 500; seed++) {
      const rand = rng(seed);
      const rows = randomForest(rand, 4 + Math.floor(rand() * 12));
      const leavesBefore = pageRowChildren(rows);
      // Precondition: a page row is a leaf of the content forest.
      for (const [, kids] of leavesBefore) expect(kids).toEqual([]);

      for (const b of rows) {
        const sibs = childrenOf(rows, b.parentId);
        const prev = sibs[sibs.findIndex((s) => s.id === b.id) - 1] ?? null;
        // The previous VISIBLE leaf, computed independently of the reducer.
        let leaf = prev;
        while (leaf?.expanded) {
          const kids = childrenOf(rows, leaf.id);
          if (kids.length === 0) break;
          leaf = kids[kids.length - 1]!;
        }

        const split = applyBlockOp(rows, { kind: "split", blockId: b.id, position: 0, newId: "x" });
        const indent = applyBlockOp(rows, { kind: "indent", blockId: b.id });
        const merge = applyBlockOp(rows, { kind: "merge", blockId: b.id });

        if (b.type === PAGE_BLOCK_TYPE) {
          expect(split).toBe(rows);
          splitGuarded++;
        } else {
          expect(split).not.toBe(rows);
        }

        if (prev === null || prev.type === PAGE_BLOCK_TYPE) {
          expect(indent).toBe(rows);
          if (prev?.type === PAGE_BLOCK_TYPE) indentGuarded++;
        } else {
          expect(indent.find((r) => r.id === b.id)!.parentId).toBe(prev.id);
        }

        if (b.type === PAGE_BLOCK_TYPE || leaf === null || leaf.type === PAGE_BLOCK_TYPE) {
          expect(merge).toBe(rows);
          if (leaf?.type === PAGE_BLOCK_TYPE) mergeGuarded++;
        } else {
          expect(merge.find((r) => r.id === b.id)).toBeUndefined();
        }

        // Page rows never gain a child through any of the three guarded ops —
        // a child there would carry the OUTER page's `page_id` forever.
        for (const out of [split, indent, merge]) {
          for (const [, kids] of pageRowChildren(out)) expect(kids).toEqual([]);
        }
      }
    }

    expect(splitGuarded).toBeGreaterThan(100);
    expect(indentGuarded).toBeGreaterThan(50);
    expect(mergeGuarded).toBeGreaterThan(50);
  });
});

describe("page rows — op-sequence simulation", () => {
  test("a long chain of ops keeps every parent's sibling ranks strictly ascending", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = rng(seed);
      let rows = randomForest(rand, 5 + Math.floor(rand() * 12));

      for (let step = 0; step < 60 && rows.length > 0; step++) {
        rows = applyBlockOp(rows, randomOp(rand, rows, step));
        assertRankOrdering(rows);
      }
    }
  });
});
