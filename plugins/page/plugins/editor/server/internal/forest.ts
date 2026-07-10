import { eq } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import {
  planForestInsert,
  rankWindow as rankWindowCore,
  serializeSubtree as serializeSubtreeCore,
} from "../../core/block-forest";
import type { SerializedBlock } from "../../core/serialized-block";
import { rowToNode } from "./reconcile";
import { _blocks } from "./tables";

export type BlockRow = typeof _blocks.$inferSelect;

/** Load every content block of a page (raw rows, rank as the stored string). */
export async function loadPageBlocks(
  pageId: string,
  executor: RankExecutor = db,
): Promise<BlockRow[]> {
  return executor.select().from(_blocks).where(eq(_blocks.pageId, pageId));
}

/**
 * Build a portable `SerializedBlock` for a block and its descendants, reading the
 * (already-loaded) page rows. Children are ordered by rank. Delegates to the pure
 * `core/block-forest` version after adapting `BlockRow`→`BlockNode`.
 */
export function serializeSubtree(rows: BlockRow[], rootId: string): SerializedBlock {
  return serializeSubtreeCore(rows.map(rowToNode), rootId);
}

/**
 * Insert a `SerializedBlock[]` forest under `parentId`, minting fresh ids and
 * ranks. The id/rank algebra is the pure `planForestInsert` (shared with the
 * in-memory store); this is the thin persistence loop over its planned nodes.
 * Top-level nodes use the caller-provided `rootRanks` (one per node); children
 * get a fresh open interval. Does not notify/emit — the caller does so once after
 * the surrounding transaction. Returns the new top-level ids in order.
 *
 * `pageId` is the resolved page scope for the inserted top-level nodes (their
 * nearest `type="page"` ancestor, i.e. `computePageId(parentId)`). Children
 * inherit it, except under a `type="page"` node, whose descendants are scoped to
 * that node's own id.
 */
export async function insertForest(
  executor: RankExecutor,
  args: {
    pageId: string | null;
    parentId: string | null;
    rootRanks: Rank[];
    forest: SerializedBlock[];
  },
): Promise<{ rootIds: string[] }> {
  const { nodes, rootIds } = planForestInsert(args);
  // Planned nodes are parent-before-descendant, so this insert order satisfies
  // the self-referential FK.
  for (const node of nodes) {
    await executor.insert(_blocks).values({
      id: node.id,
      pageId: node.pageId,
      parentId: node.parentId,
      type: node.type,
      data: node.data ?? {},
      rank: node.rank,
      expanded: node.expanded,
    });
  }
  return { rootIds };
}

/**
 * Resolve the rank window for inserting a contiguous run of siblings under
 * `parentId`, positioned immediately after `afterId` (or at the start when
 * `afterId` is null). `excludeIds` are blocks being moved out of this sibling
 * list (so they don't bound the window). Returns `[prevRank, nextRank]` as raw
 * Rank values for `Rank.nBetween`. Delegates to the pure `core/block-forest`
 * version after adapting `BlockRow`→`BlockNode`.
 */
export function rankWindow(
  rows: BlockRow[],
  parentId: string | null,
  afterId: string | null,
  excludeIds: ReadonlySet<string>,
): [Rank | null, Rank | null] {
  return rankWindowCore(rows.map(rowToNode), parentId, afterId, excludeIds);
}

/**
 * Mint the rank that places a block immediately `zone` of `targetId` among the
 * siblings of `parentId`. The twin of `rankWindow` for a single block, and the
 * `page_blocks` analogue of the queue's `rankAdjacentTo` (which is the live
 * precedent for "the wire carries positional intent, the server carries the
 * rank": `plugins/conversations/.../queue/server/internal/queue-ranks.ts`).
 *
 * `targetId === null` addresses the sibling-list boundary rather than a
 * neighbour: `"after"` appends at the end, `"before"` prepends at the start.
 *
 * `excludeIds` are blocks leaving this sibling list (the moved block itself), so
 * they never bound their own insertion point.
 *
 * `rows` MUST be the COMPLETE sibling set — every row with that `parent_id`,
 * unfiltered by `page_id` and unfiltered by `type`. `page_blocks` has one
 * ordering space that several live resources project disjointly; arithmetic over
 * a filtered projection mints keys that collide with the invisible siblings.
 * Pure over `rows` (the caller loads them, inside its own transaction).
 *
 * Throws (via `Rank.between`) when the neighbourhood is degenerate — two live
 * siblings already sharing a rank. That is the correct, loud signal: it means
 * the ordering space is already corrupt, and no fallback key would be sound.
 */
export function rankAdjacentTo(
  rows: BlockRow[],
  parentId: string | null,
  targetId: string | null,
  zone: "before" | "after",
  excludeIds: ReadonlySet<string>,
): Rank {
  const siblings = rows
    .filter((r) => r.parentId === parentId && !excludeIds.has(r.id))
    .map((r) => Rank.from(r.rank))
    .sort((a, b) => Rank.compare(a, b));

  if (targetId === null) {
    return zone === "after"
      ? Rank.between(siblings[siblings.length - 1] ?? null, null)
      : Rank.between(null, siblings[0] ?? null);
  }

  const targetRow = rows.find((r) => r.id === targetId);
  if (!targetRow) {
    throw new Error(`rankAdjacentTo: target ${targetId} is not among the siblings`);
  }
  const target = Rank.from(targetRow.rank);

  if (zone === "before") {
    const preds = siblings.filter((r) => Rank.compare(r, target) < 0);
    return Rank.between(preds[preds.length - 1] ?? null, target);
  }
  const succ = siblings.find((r) => Rank.compare(r, target) > 0) ?? null;
  return Rank.between(target, succ);
}
