// Shared pure forest algebra for the block editor: the id/rank-minting insert
// planner plus the two rank/tree helpers (`rankWindow`, `serializeSubtree`).
//
// Everything here operates on the reducer's JSON-pure `BlockNode` currency (rank
// as the stored string form) — the SAME shape `applyBlockOp` consumes. This is
// the single source of the bulk/paste/duplicate insert logic, shared verbatim by
// BOTH the server handlers (which adapt `BlockRow`→`BlockNode` via `rowToNode`
// then persist the planned nodes) and the in-memory block store (which appends
// the planned nodes to its `useState` array). Zero divergence between the two.
//
// Pure module (no React, no DB): unit-tested directly in `block-forest.test.ts`.

import { Rank } from "@plugins/primitives/plugins/rank/core";
import { PAGE_BLOCK_TYPE } from "./schemas";
import type { BlockNode } from "./block-ops";
import type { SerializedBlock } from "./serialized-block";

/**
 * Build a portable `SerializedBlock` for a block and its descendants, reading a
 * (already-loaded) node list. Children are ordered by rank. No ids/ranks/scope
 * survive — the shape re-mints cleanly on insert (see `planForestInsert`).
 */
export function serializeSubtree(nodes: BlockNode[], rootId: string): SerializedBlock {
  const root = nodes.find((n) => n.id === rootId);
  if (!root) throw new Error(`serializeSubtree: block ${rootId} not found`);
  const children = nodes
    .filter((n) => n.parentId === rootId)
    .sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)))
    .map((c) => serializeSubtree(nodes, c.id));
  return {
    type: root.type,
    data: root.data,
    expanded: root.expanded,
    children,
  };
}

/**
 * Resolve the rank window for inserting a contiguous run of siblings under
 * `parentId`, positioned immediately after `afterId` (or at the start when
 * `afterId` is null). `excludeIds` are blocks being moved out of this sibling
 * list (so they don't bound the window). Returns `[prevRank, nextRank]` as raw
 * `Rank` values for `Rank.nBetween`.
 */
export function rankWindow(
  nodes: BlockNode[],
  parentId: string | null,
  afterId: string | null,
  excludeIds: ReadonlySet<string>,
): [Rank | null, Rank | null] {
  const siblings = nodes
    .filter((n) => n.parentId === parentId && !excludeIds.has(n.id))
    .map((n) => Rank.from(n.rank))
    .sort((a, b) => Rank.compare(a, b));
  const afterRow = afterId ? nodes.find((n) => n.id === afterId) : undefined;
  const prev = afterRow ? Rank.from(afterRow.rank) : null;
  const next =
    prev === null
      ? (siblings[0] ?? null)
      : (siblings.find((r) => Rank.compare(r, prev) > 0) ?? null);
  return [prev, next];
}

/**
 * Plan the insertion of a `SerializedBlock[]` forest under `parentId`, minting
 * fresh ids (`crypto.randomUUID()`) and child ranks (`Rank.nBetween`). The pure
 * core of the server's `insertForest`: returns new `BlockNode` descriptors
 * (parent-before-descendant order, a valid topological insert order) instead of
 * persisting them, plus the new top-level ids in order.
 *
 * Top-level nodes use the caller-provided `rootRanks` (one per node); each node's
 * children get a fresh open interval (`Rank.nBetween(null, null)`), keeping keys
 * short since siblings are self-contained. Recursive.
 *
 * `pageId` is the resolved page scope for the inserted top-level nodes (their
 * nearest `type="page"` ancestor, i.e. `computePageId(parentId)`). Children
 * inherit it, except under a `type="page"` node whose descendants are scoped to
 * that node's own id.
 */
export function planForestInsert(args: {
  pageId: string | null;
  parentId: string | null;
  rootRanks: Rank[];
  forest: SerializedBlock[];
}): { nodes: BlockNode[]; rootIds: string[] } {
  const { pageId, parentId, rootRanks, forest } = args;
  const nodes: BlockNode[] = [];
  const rootIds: string[] = [];
  for (let i = 0; i < forest.length; i++) {
    const node = forest[i]!;
    const id = crypto.randomUUID();
    rootIds.push(id);
    nodes.push({
      id,
      pageId,
      parentId,
      type: node.type,
      data: node.data ?? {},
      rank: rootRanks[i]!.toJSON(),
      expanded: node.expanded,
    });
    if (node.children.length > 0) {
      const child = planForestInsert({
        // Children of a page node are scoped to that page; otherwise inherit.
        pageId: node.type === PAGE_BLOCK_TYPE ? id : pageId,
        parentId: id,
        rootRanks: Rank.nBetween(null, null, node.children.length),
        forest: node.children,
      });
      nodes.push(...child.nodes);
    }
  }
  return { nodes, rootIds };
}
