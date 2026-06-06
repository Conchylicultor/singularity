import { eq } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import type { SerializedBlock } from "../../core/serialized-block";
import { _blocks } from "./tables";

export type BlockRow = typeof _blocks.$inferSelect;

/** Load every block of a document (raw rows, rank as the stored string). */
export async function loadDocBlocks(
  documentId: string,
  executor: RankExecutor = db,
): Promise<BlockRow[]> {
  return executor.select().from(_blocks).where(eq(_blocks.documentId, documentId));
}

/**
 * Build a portable `SerializedBlock` for a block and its descendants, reading
 * the (already-loaded) document rows. Children are ordered by rank.
 */
export function serializeSubtree(rows: BlockRow[], rootId: string): SerializedBlock {
  const root = rows.find((r) => r.id === rootId);
  if (!root) throw new Error(`serializeSubtree: block ${rootId} not found`);
  const children = rows
    .filter((r) => r.parentId === rootId)
    .sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)))
    .map((c) => serializeSubtree(rows, c.id));
  return {
    type: root.type,
    data: root.data,
    expanded: root.expanded,
    children,
  };
}

/**
 * Insert a `SerializedBlock[]` forest under `parentId`, minting fresh ids and
 * ranks. Top-level nodes use the caller-provided `rootRanks` (one per node);
 * each node's children get a fresh open interval (`Rank.nBetween(null, null)`),
 * which keeps keys short since siblings are self-contained. Recursive. Does not
 * notify/emit — the caller does so once after the surrounding transaction.
 * Returns the new top-level ids in order.
 */
export async function insertForest(
  executor: RankExecutor,
  args: {
    documentId: string;
    parentId: string | null;
    rootRanks: Rank[];
    forest: SerializedBlock[];
  },
): Promise<{ rootIds: string[] }> {
  const { documentId, parentId, rootRanks, forest } = args;
  const rootIds: string[] = [];
  for (let i = 0; i < forest.length; i++) {
    const node = forest[i]!;
    const id = crypto.randomUUID();
    rootIds.push(id);
    await executor.insert(_blocks).values({
      id,
      documentId,
      parentId,
      type: node.type,
      data: node.data ?? {},
      rank: rootRanks[i]!.toJSON(),
      expanded: node.expanded,
    });
    if (node.children.length > 0) {
      await insertForest(executor, {
        documentId,
        parentId: id,
        rootRanks: Rank.nBetween(null, null, node.children.length),
        forest: node.children,
      });
    }
  }
  return { rootIds };
}

/**
 * Resolve the rank window for inserting a contiguous run of siblings under
 * `parentId`, positioned immediately after `afterId` (or at the start when
 * `afterId` is null). `excludeIds` are blocks being moved out of this sibling
 * list (so they don't bound the window). Returns `[prevRank, nextRank]` as raw
 * Rank values for `Rank.nBetween`.
 */
export function rankWindow(
  rows: BlockRow[],
  parentId: string | null,
  afterId: string | null,
  excludeIds: ReadonlySet<string>,
): [Rank | null, Rank | null] {
  const siblings = rows
    .filter((r) => r.parentId === parentId && !excludeIds.has(r.id))
    .map((r) => Rank.from(r.rank))
    .sort((a, b) => Rank.compare(a, b));
  const afterRow = afterId ? rows.find((r) => r.id === afterId) : undefined;
  const prev = afterRow ? Rank.from(afterRow.rank) : null;
  const next =
    prev === null
      ? (siblings[0] ?? null)
      : (siblings.find((r) => Rank.compare(r, prev) > 0) ?? null);
  return [prev, next];
}
