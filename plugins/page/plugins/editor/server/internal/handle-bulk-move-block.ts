import { eq, inArray } from "drizzle-orm";
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
import { blocksChanged } from "./tables-events";
import { recomputePageIdSubtree } from "./page-id";
import { loadLiveSiblings, loadPageBlocks, rankWindow } from "./forest";
import { parkRanks } from "./rank-park";

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

    const movingSubtree = new Set(roots.flatMap((r) => subtreeIds(rows, r)));
    const byId = new Map(rows.map((r) => [r.id, r]));

    await db.transaction(async (tx) => {
      // Rank arithmetic is only valid over the COMPLETE sibling set. `rows` is
      // page-scoped (`loadPageBlocks` = `WHERE page_id = ?`), so when the
      // destination parent is a `page` row its children — keyed
      // `page_id = <that row>` — are absent from it, and a window computed over
      // `rows` would mint `"a0"` straight onto the sub-page's existing first
      // child. `loadLiveSiblings` queries the destination's true live sibling
      // set by `parent_id` alone (and guards that the destination itself is
      // live — 404 otherwise). Read inside the transaction so the window can't
      // go stale before the writes land.
      const destSiblings = await loadLiveSiblings(tx, body.parentId);

      // Exclude everything that is moving, so the moved roots don't bound their
      // own insertion window.
      const [prev, next] = rankWindow(
        destSiblings,
        body.parentId,
        body.afterId,
        movingSubtree,
      );
      const ranks = Rank.nBetween(prev, next, roots.length);
      const placements = roots.map((id, i) => ({
        id,
        currentParentId: byId.get(id)!.parentId,
        parentId: body.parentId,
        rank: ranks[i]!.toJSON(),
      }));

      // Two-phase park-then-place. The window above EXCLUDES the moving ids, so
      // a computed key can equal a rank a still-unmoved root holds (siblings
      // B="a1", C="a2", D="a3"; move {B,D} after C ⇒ keys ["a3","a4"], and
      // B → "a3" lands while D still sits at "a3"). The `(parent_id, rank)`
      // unique index is per-tuple, so that transient duplicate aborts the
      // transaction. Parking each root beyond its parent's max first makes the
      // final keys collision-free in any order. See `rank-park.ts`.
      await parkRanks(tx, { placements });

      for (const p of placements) {
        await tx
          .update(_blocks)
          .set({ parentId: p.parentId, rank: p.rank, updatedAt: new Date() })
          .where(eq(_blocks.id, p.id));
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

    // Re-read the moved roots BY ID, not by page scope: a move into a sub-page
    // re-stamps their `page_id`, so a `WHERE page_id = params.pageId` read would
    // silently return fewer rows than were moved.
    const moved = await db
      .select()
      .from(_blocks)
      .where(inArray(_blocks.id, roots));

    // Fan out to reindex subscribers for the source page AND every destination
    // page the selection landed in, deduped — the same both-scopes emit
    // `handleMoveBlock` does.
    const affected = new Set<string>([params.pageId]);
    for (const r of moved) if (r.pageId !== null) affected.add(r.pageId);
    for (const pageId of affected) await blocksChanged.emit({ pageId });

    return moved.map((r) => BlockSchema.parse(r));
  },
);
