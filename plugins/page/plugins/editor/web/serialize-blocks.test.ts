/**
 * Pure unit tests for THE forest serializer (`web/serialize-blocks.ts`).
 * Run with `bun test plugins/page/plugins/editor/web/serialize-blocks.test.ts`.
 *
 * `serializeForest` is what copy and duplicate BOTH run, which is what makes
 * "duplicate ≡ copy + paste after each source" true by construction. These cases
 * were `core/block-forest.test.ts`'s `serializeSubtree` describe — the
 * server-side twin the duplicate op deleted — retargeted at the surviving
 * signature: `Block[]` rows plus an ARRAY of root ids in, `SerializedBlock[]`
 * out.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  planForestInsert,
  withMintedIds,
  type Block,
  type BlockNode,
  type SerializedBlock,
} from "../core";
import { serializeForest } from "./serialize-blocks";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Build a document row. Rows carry `rank` as a real `Rank` (the reducer's
 * `BlockNode` carries the string form) — that is the one shape difference from
 * `core/block-forest.test.ts`'s `mk`, and the reason `rowsOf` exists below.
 */
function mk(
  id: string,
  parentId: string | null,
  rank: Rank,
  opts: { type?: string; pageId?: string | null; expanded?: boolean; text?: string } = {},
): Block {
  return {
    id,
    pageId: opts.pageId === undefined ? "page-1" : opts.pageId,
    parentId,
    type: opts.type ?? "text",
    data: { text: opts.text ?? id },
    rank,
    expanded: opts.expanded ?? false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

const r0 = Rank.between(null, null);
function after(prev: Rank): Rank {
  return Rank.between(prev, null);
}

function leaf(type: string, data?: unknown): SerializedBlock {
  return { type, data, expanded: false, children: [] };
}

/** Planner output (`BlockNode[]`, string ranks) as document rows. */
function rowsOf(nodes: BlockNode[]): Block[] {
  return nodes.map((n) => ({
    ...n,
    rank: Rank.from(n.rank),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }));
}

// ---------------------------------------------------------------------------
// serializeForest
// ---------------------------------------------------------------------------

describe("serializeForest", () => {
  test("captures type/data/expanded and rank-ordered children", () => {
    const r1 = r0;
    const r2 = after(r1);
    const rows = [
      mk("root", null, r1, { type: "callout", expanded: true, text: "root" }),
      // Deliberately unsorted insertion order; serialize must sort by rank.
      mk("c2", "root", r2, { text: "c2" }),
      mk("c1", "root", r1, { text: "c1" }),
    ];
    const [s] = serializeForest(rows, ["root"]);
    expect(s!.type).toBe("callout");
    expect(s!.expanded).toBe(true);
    expect(s!.children.map((c) => (c.data as { text: string }).text)).toEqual(["c1", "c2"]);
  });

  test("round-trips through a plan → serialize cycle (structure preserved)", () => {
    const original: SerializedBlock = {
      type: "callout",
      data: { text: "note", color: "blue" },
      expanded: true,
      children: [
        leaf("text", { text: "one" }),
        {
          type: "toggle",
          data: { text: "two" },
          expanded: false,
          children: [leaf("text", { text: "nested" })],
        },
      ],
    };
    const { nodes, rootIds } = planForestInsert({
      pageId: "page-1",
      parentId: null,
      rootRanks: Rank.nBetween(null, null, 1),
      forest: withMintedIds([original]),
    });
    expect(serializeForest(rowsOf(nodes), rootIds)).toEqual([original]);
  });

  test("a COLLAPSED subtree still serializes whole (rows, not visible lines)", () => {
    // The rows are the source of truth; `expanded` is carried as payload, never
    // read as a traversal gate. A copy/duplicate of a collapsed toggle must
    // bring its hidden children along.
    const rows = [
      mk("root", null, r0, { type: "toggle", expanded: false }),
      mk("hidden", "root", r0),
    ];
    const [s] = serializeForest(rows, ["root"]);
    expect(s!.expanded).toBe(false);
    expect(s!.children.map((c) => c.type)).toEqual(["text"]);
  });

  test("several roots serialize in the ARRAY's order, not in rank order", () => {
    // The caller's array is the order — it is what `bulkDuplicate` document-orders
    // before building its placements, and what a copy hands the clipboard.
    const r1 = r0;
    const r2 = after(r1);
    const rows = [mk("A", null, r1), mk("B", null, r2)];
    expect(serializeForest(rows, ["B", "A"]).map((s) => (s.data as { text: string }).text)).toEqual(
      ["B", "A"],
    );
  });

  test("a root id absent from the rows is dropped; the others still serialize", () => {
    // Deliberately NOT a throw, unlike the deleted `serializeSubtree`: the rows
    // are a live snapshot, so a root can legitimately vanish under a concurrent
    // delete between selection and copy.
    const rows = [mk("A", null, r0)];
    expect(serializeForest(rows, ["GONE", "A"]).map((s) => s.type)).toEqual(["text"]);
  });

  test("no roots → an empty forest", () => {
    expect(serializeForest([mk("A", null, r0)], [])).toEqual([]);
  });
});
