import { eq } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  isDescendant,
  selectionRoots,
  subtreeIds,
} from "@plugins/primitives/plugins/tree/core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { bulkMoveBlocks } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";
import { recomputePageIdSubtree } from "./page-id";
import { loadPageBlocks, rankWindow } from "./forest";

export const handleBulkMoveBlock = implement(
  bulkMoveBlocks,
  async ({ params, body }) => {
    if (body.ids.length === 0) return [];

    const rows = await loadPageBlocks(params.pageId);
    const moving = new Set(body.ids);
    const roots = selectionRoots(rows, moving);
    if (roots.length === 0) return [];

    // Guard: can't drop the selection into its own subtree (incl. onto itself).
    if (body.parentId !== null) {
      if (moving.has(body.parentId)) {
        throw new HttpError(400, "Cannot move blocks into the selection");
      }
      for (const root of roots) {
        if (isDescendant(rows, root, body.parentId)) {
          throw new HttpError(400, "Cannot move a block into its own subtree");
        }
      }
    }

    // Rank window under the destination parent, excluding everything that is
    // moving (so the moved roots don't bound their own insertion window).
    const movingSubtree = new Set(roots.flatMap((r) => subtreeIds(rows, r)));
    const [prev, next] = rankWindow(
      rows,
      body.parentId,
      body.afterId,
      movingSubtree,
    );
    const ranks = Rank.nBetween(prev, next, roots.length);

    await db.transaction(async (tx) => {
      for (let i = 0; i < roots.length; i++) {
        await tx
          .update(_blocks)
          .set({
            parentId: body.parentId,
            rank: ranks[i]!.toJSON(),
            updatedAt: new Date(),
          })
          .where(eq(_blocks.id, roots[i]!));
      }
      if (body.parentId) {
        await tx
          .update(_blocks)
          .set({ expanded: true, updatedAt: new Date() })
          .where(eq(_blocks.id, body.parentId));
      }
      // Reparenting can move subtrees into a different page; recompute each.
      for (const root of roots) await recomputePageIdSubtree(root, tx);
    });

    blocksLiveResource.notify({ pageId: params.pageId });
    await blocksChanged.emit({ pageId: params.pageId });

    const moved = await db
      .select()
      .from(_blocks)
      .where(eq(_blocks.pageId, params.pageId));
    return moved
      .filter((r) => roots.includes(r.id))
      .map((r) => BlockSchema.parse(r));
  },
);
