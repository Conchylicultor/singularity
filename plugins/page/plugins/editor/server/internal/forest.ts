import { and, eq, isNull } from "drizzle-orm";
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
import { parseBlockData } from "./parse-block-data";
import { requireLiveParent, type BlockReadExecutor } from "./page-id";

export type BlockRow = typeof _blocks.$inferSelect;

/**
 * The destination sibling set of a REPARENT, plus the liveness guard on the
 * destination itself. Every write that moves a block under a caller-supplied
 * `parentId` must read this to mint a rank, which is what makes it the natural
 * chokepoint for the guard (see `requireLiveParent`): a future move-shaped
 * handler cannot position a block without going through it.
 *
 * Returns EVERY LIVE row under `parentId` — not scoped by `page_id`, not
 * filtered by `type`, but excluding trashed rows. `(parent_id, rank)` is ONE
 * ordering space shared by sub-page rows and content rows, and several live
 * resources project it disjointly, so arithmetic over a filtered projection
 * mints keys that collide with the siblings it cannot see. Trashed rows are
 * excluded for the opposite reason: the unique index is partial
 * (`WHERE deleted_at IS NULL`), so a trashed row may legitimately share a live
 * row's rank — including it would hand the rank math two siblings at one rank
 * and abort with `Rank.between(r, r)`.
 *
 * Call inside the write's own transaction so the window cannot go stale before
 * the writes land.
 */
export async function loadLiveSiblings(
  executor: BlockReadExecutor,
  parentId: string | null,
): Promise<BlockRow[]> {
  await requireLiveParent(parentId, executor);
  return executor
    .select()
    .from(_blocks)
    .where(
      parentId === null
        ? and(isNull(_blocks.parentId), isNull(_blocks.deletedAt))
        : and(eq(_blocks.parentId, parentId), isNull(_blocks.deletedAt)),
    );
}

/**
 * Load every LIVE content block of a page (raw rows, rank as the stored string).
 * Trashed rows are excluded: this feeds the op/patch reducers AND the rank-window
 * math, and the partial unique index only constrains live rows — so rank
 * arithmetic must run over exactly the live sibling set to stay consistent.
 */
export async function loadPageBlocks(
  pageId: string,
  executor: RankExecutor = db,
): Promise<BlockRow[]> {
  return executor
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.pageId, pageId), isNull(_blocks.deletedAt)));
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
      data: parseBlockData(node.type, node.data),
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
