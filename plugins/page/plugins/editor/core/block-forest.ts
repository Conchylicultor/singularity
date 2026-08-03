// Shared pure forest algebra for the block editor: the id/rank-minting insert
// planner plus the `rankWindow` sibling-interval helper.
//
// Everything here operates on the reducer's JSON-pure `BlockNode` currency (rank
// as the stored string form) — the SAME shape `applyBlockOp` consumes. This is
// the single source of the bulk/paste/duplicate insert logic, shared verbatim by
// BOTH the server handlers (which adapt `BlockRow`→`BlockNode` via `rowToNode`
// then persist the planned nodes) and the reducer's own forest-insert arm
// (`insertForestAt`, behind `paste` and `duplicate`). Zero divergence.
//
// Pure module (no React, no DB): unit-tested directly in `block-forest.test.ts`.

import { Rank } from "@plugins/primitives/plugins/rank/core";
import { PAGE_BLOCK_TYPE } from "./schemas";
import type { BlockNode } from "./block-ops";
import type { IdentifiedBlock } from "./serialized-block";

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
 * The rank a row lands on when dropped `zone` of `targetId` among `parentId`'s
 * children — positional INTENT resolved into a key, over the sibling set the
 * caller holds.
 *
 * This is the reducer's half of the positional-intent contract: `move` travels
 * as `(parentId, targetId, zone)` and NEVER as a rank, because `page_blocks` has
 * one `(parent_id, rank)` space that several live resources project disjointly.
 * Both sides then mint their own key here — the client for its overlay, the
 * server authoritatively — which agrees exactly as long as both hold the
 * COMPLETE sibling set under `parentId`. That is the invariant a `move` op
 * carries (the destination lies inside the op's own page; a cross-page drop is
 * not one page's op — see `composite-block-store.tsx`).
 *
 * `targetId: null` addresses the sibling-list boundary rather than a neighbour:
 * `"after"` appends, `"before"` prepends — byte-for-byte the contract
 * `MoveBlockBodySchema` states for the wire.
 *
 * `excludeIds` are rows leaving this sibling list, so they never bound their own
 * destination window.
 */
export function positionalRank(
  nodes: BlockNode[],
  parentId: string | null,
  targetId: string | null,
  zone: "before" | "after",
  excludeIds: ReadonlySet<string>,
): Rank {
  const siblings = nodes
    .filter((n) => n.parentId === parentId && !excludeIds.has(n.id))
    .sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)));
  // Reduce the (target, zone) pair to the ONE anchor `rankWindow` understands:
  // the sibling the row lands immediately after, or null for the list's start.
  let afterId: string | null;
  if (targetId === null) {
    afterId = zone === "after" ? (siblings[siblings.length - 1]?.id ?? null) : null;
  } else if (zone === "after") {
    afterId = targetId;
  } else {
    const idx = siblings.findIndex((s) => s.id === targetId);
    afterId = idx > 0 ? siblings[idx - 1]!.id : null;
  }
  const [prev, next] = rankWindow(nodes, parentId, afterId, excludeIds);
  return Rank.between(prev, next);
}

/**
 * Plan the insertion of an already-identified forest under `parentId`, minting
 * child ranks (`Rank.nBetween`). The pure core of the server's `insertForest`:
 * returns new `BlockNode` descriptors (parent-before-descendant order, a valid
 * topological insert order) instead of persisting them, plus the new top-level
 * ids in order.
 *
 * Ids come IN, on the nodes (`withMintedIds` is the one minting site). That is
 * what makes this planner usable as a reducer step: the client and the server
 * both run it over their own view of the forest and produce the same rows, the
 * same contract `split`/`insert` hold with their `newId`. Ranks still differ per
 * side — each computes them against the sibling set it can see, and the server's
 * are authoritative.
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
  forest: IdentifiedBlock[];
}): { nodes: BlockNode[]; rootIds: string[] } {
  const { pageId, parentId, rootRanks, forest } = args;
  const nodes: BlockNode[] = [];
  const rootIds: string[] = [];
  for (let i = 0; i < forest.length; i++) {
    const node = forest[i]!;
    const id = node.id;
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
