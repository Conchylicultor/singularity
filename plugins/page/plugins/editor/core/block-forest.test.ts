/**
 * Pure unit tests for the shared forest algebra (`core/block-forest.ts`).
 * Run with `bun test plugins/page/plugins/editor/core/block-forest.test.ts`.
 *
 * Covers `planForestInsert` id/rank minting + pageId inheritance (including under
 * a `type="page"` node), `rankWindow` positioning, and a `serializeSubtree`
 * round-trip through a plan+serialize cycle.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { PAGE_BLOCK_TYPE } from "./schemas";
import { planForestInsert, rankWindow, serializeSubtree } from "./block-forest";
import type { BlockNode } from "./block-ops";
import type { SerializedBlock } from "./serialized-block";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mk(
  id: string,
  parentId: string | null,
  rank: string,
  opts: { type?: string; pageId?: string | null; expanded?: boolean; text?: string } = {},
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

const r0 = Rank.between(null, null);
function after(prev: Rank): Rank {
  return Rank.between(prev, null);
}

function leaf(type: string, data?: unknown): SerializedBlock {
  return { type, data, expanded: false, children: [] };
}

/** Assert ranks are strictly ascending within every parent group. */
function assertRankOrdering(nodes: BlockNode[]): void {
  const byParent = new Map<string | null, BlockNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  for (const list of byParent.values()) {
    const sorted = [...list].sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)));
    for (let i = 1; i < sorted.length; i++) {
      expect(Rank.compare(Rank.from(sorted[i - 1]!.rank), Rank.from(sorted[i]!.rank))).toBe(-1);
    }
  }
}

// ---------------------------------------------------------------------------
// planForestInsert
// ---------------------------------------------------------------------------

describe("planForestInsert", () => {
  test("mints unique ids for every node and returns the top-level ids in order", () => {
    const forest: SerializedBlock[] = [
      { type: "text", data: { text: "a" }, expanded: false, children: [leaf("text", { text: "a1" })] },
      leaf("text", { text: "b" }),
    ];
    const rootRanks = Rank.nBetween(null, null, forest.length);
    const { nodes, rootIds } = planForestInsert({
      pageId: "page-1",
      parentId: "parent-1",
      rootRanks,
      forest,
    });

    // 2 roots + 1 child = 3 nodes; all ids distinct.
    expect(nodes.length).toBe(3);
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.size).toBe(3);
    // rootIds are the two top-level nodes, in order.
    expect(rootIds.length).toBe(2);
    expect(nodes[0]!.id).toBe(rootIds[0]!);
    const roots = nodes.filter((n) => n.parentId === "parent-1");
    expect(roots.map((n) => n.id)).toEqual(rootIds);
  });

  test("top-level nodes use the provided rootRanks; children get a fresh interval", () => {
    const forest: SerializedBlock[] = [
      { type: "text", data: {}, expanded: false, children: [leaf("text"), leaf("text")] },
    ];
    const rootRanks = Rank.nBetween(null, null, 1);
    const { nodes, rootIds } = planForestInsert({
      pageId: "page-1",
      parentId: "parent-1",
      rootRanks,
      forest,
    });
    const root = nodes.find((n) => n.id === rootIds[0]!)!;
    expect(root.rank).toBe(rootRanks[0]!.toJSON());
    const children = nodes.filter((n) => n.parentId === root.id);
    expect(children.length).toBe(2);
    assertRankOrdering(nodes);
  });

  test("children inherit the parent's pageId under a non-page node", () => {
    const forest: SerializedBlock[] = [
      { type: "text", data: {}, expanded: false, children: [leaf("text")] },
    ];
    const { nodes, rootIds } = planForestInsert({
      pageId: "page-1",
      parentId: "parent-1",
      rootRanks: Rank.nBetween(null, null, 1),
      forest,
    });
    const child = nodes.find((n) => n.parentId === rootIds[0]!)!;
    expect(child.pageId).toBe("page-1");
  });

  test("descendants of a type=page node are scoped to that node's own id", () => {
    const forest: SerializedBlock[] = [
      {
        type: PAGE_BLOCK_TYPE,
        data: {},
        expanded: false,
        children: [{ type: "text", data: {}, expanded: false, children: [leaf("text")] }],
      },
    ];
    const { nodes, rootIds } = planForestInsert({
      pageId: "page-1",
      parentId: "parent-1",
      rootRanks: Rank.nBetween(null, null, 1),
      forest,
    });
    const pageNodeId = rootIds[0]!;
    const pageNode = nodes.find((n) => n.id === pageNodeId)!;
    // The page node itself is still scoped to the OUTER page.
    expect(pageNode.pageId).toBe("page-1");
    // Its child and grandchild are scoped to the page node's own id.
    const child = nodes.find((n) => n.parentId === pageNodeId)!;
    expect(child.pageId).toBe(pageNodeId);
    const grandchild = nodes.find((n) => n.parentId === child.id)!;
    expect(grandchild.pageId).toBe(pageNodeId);
  });

  test("nodes are ordered parent-before-descendant (valid FK insert order)", () => {
    const forest: SerializedBlock[] = [
      { type: "text", data: {}, expanded: false, children: [leaf("text"), leaf("text")] },
    ];
    const { nodes } = planForestInsert({
      pageId: "page-1",
      parentId: null,
      rootRanks: Rank.nBetween(null, null, 1),
      forest,
    });
    const seen = new Set<string>();
    for (const n of nodes) {
      if (n.parentId !== null && !seen.has(n.parentId)) {
        // Only fails if a child appears before its parent within the planned set.
        // (parentId "null"/external parents are fine.)
        expect(nodes.some((p) => p.id === n.parentId)).toBe(true);
        expect(seen.has(n.parentId)).toBe(true);
      }
      seen.add(n.id);
    }
  });
});

// ---------------------------------------------------------------------------
// rankWindow
// ---------------------------------------------------------------------------

describe("rankWindow", () => {
  const EMPTY = new Set<string>();

  test("null afterId → window before the first sibling", () => {
    const r1 = r0;
    const r2 = after(r1);
    const nodes = [mk("a", "p", r1.toJSON()), mk("b", "p", r2.toJSON())];
    const [prev, next] = rankWindow(nodes, "p", null, EMPTY);
    expect(prev).toBeNull();
    expect(next).not.toBeNull();
    expect(Rank.compare(next!, r1)).toBe(0);
  });

  test("afterId → window between that sibling and the next", () => {
    const r1 = r0;
    const r2 = after(r1);
    const r3 = after(r2);
    const nodes = [
      mk("a", "p", r1.toJSON()),
      mk("b", "p", r2.toJSON()),
      mk("c", "p", r3.toJSON()),
    ];
    const [prev, next] = rankWindow(nodes, "p", "b", EMPTY);
    expect(Rank.compare(prev!, r2)).toBe(0);
    expect(Rank.compare(next!, r3)).toBe(0);
  });

  test("afterId is the last sibling → open upper bound", () => {
    const r1 = r0;
    const r2 = after(r1);
    const nodes = [mk("a", "p", r1.toJSON()), mk("b", "p", r2.toJSON())];
    const [prev, next] = rankWindow(nodes, "p", "b", EMPTY);
    expect(Rank.compare(prev!, r2)).toBe(0);
    expect(next).toBeNull();
  });

  test("excludeIds are ignored when bounding the window", () => {
    const r1 = r0;
    const r2 = after(r1);
    const r3 = after(r2);
    const nodes = [
      mk("a", "p", r1.toJSON()),
      mk("b", "p", r2.toJSON()),
      mk("c", "p", r3.toJSON()),
    ];
    // Insert at start, excluding "b" — the next bound is "a", not "b".
    const [prev, next] = rankWindow(nodes, "p", null, new Set(["b"]));
    expect(prev).toBeNull();
    expect(Rank.compare(next!, r1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// serializeSubtree
// ---------------------------------------------------------------------------

describe("serializeSubtree", () => {
  test("captures type/data/expanded and rank-ordered children", () => {
    const r1 = r0;
    const r2 = after(r1);
    const nodes = [
      mk("root", null, r1.toJSON(), { type: "callout", expanded: true, text: "root" }),
      // Deliberately unsorted insertion order; serialize must sort by rank.
      mk("c2", "root", r2.toJSON(), { text: "c2" }),
      mk("c1", "root", r1.toJSON(), { text: "c1" }),
    ];
    const s = serializeSubtree(nodes, "root");
    expect(s.type).toBe("callout");
    expect(s.expanded).toBe(true);
    expect(s.children.map((c) => (c.data as { text: string }).text)).toEqual(["c1", "c2"]);
  });

  test("round-trips through a plan → serialize cycle (structure preserved)", () => {
    const original: SerializedBlock = {
      type: "callout",
      data: { text: "note", color: "blue" },
      expanded: true,
      children: [
        leaf("text", { text: "one" }),
        { type: "toggle", data: { text: "two" }, expanded: false, children: [leaf("text", { text: "nested" })] },
      ],
    };
    const { nodes, rootIds } = planForestInsert({
      pageId: "page-1",
      parentId: null,
      rootRanks: Rank.nBetween(null, null, 1),
      forest: [original],
    });
    const round = serializeSubtree(nodes, rootIds[0]!);
    expect(round).toEqual(original);
  });
});
