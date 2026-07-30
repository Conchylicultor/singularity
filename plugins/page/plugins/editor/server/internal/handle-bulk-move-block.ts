import { eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { planBulkMove } from "../../core/block-ops";
import { bulkMoveBlocks } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksChanged } from "./tables-events";
import { recomputePageIdSubtree } from "./page-id";
import { loadLiveSiblings, loadPageBlocks } from "./forest";
import { rowToNode } from "./reconcile";
import { parkRanks } from "./rank-park";

export const handleBulkMoveBlock = implement(
  bulkMoveBlocks,
  async ({ params, body }) => {
    if (body.ids.length === 0) return [];

    const rows = await loadPageBlocks(params.pageId);
    const nodes = rows.map(rowToNode);

    const roots = await db.transaction(async (tx): Promise<string[]> => {
      // Rank arithmetic is only valid over the COMPLETE sibling set. `rows` is
      // page-scoped (`loadPageBlocks` = `WHERE page_id = ?`), so when the
      // destination parent is a `page` row its children — keyed
      // `page_id = <that row>` — are absent from it, and a window computed over
      // `rows` would mint `"a0"` straight onto the sub-page's existing first
      // child. `loadLiveSiblings` queries the destination's true live sibling
      // set by `parent_id` alone (and guards that the destination itself is
      // live — 404 otherwise). Read inside the transaction so the window can't
      // go stale before the writes land — which is why the whole plan is
      // computed in here rather than before the transaction opens.
      const destSiblings = await loadLiveSiblings(tx, body.parentId);

      // The planner owns the order + rank algebra, shared verbatim with the two
      // client writers so a predicted after-state can never disagree with what
      // this commits. Its refusals are the two 400s this handler owes the user.
      const plan = planBulkMove(nodes, body, destSiblings.map(rowToNode));
      if (plan.refusal === "empty-selection") return [];
      if (plan.refusal === "into-selection") {
        throw new HttpError(400, "Cannot move blocks into the selection");
      }
      if (plan.refusal === "into-own-subtree") {
        throw new HttpError(400, "Cannot move a block into its own subtree");
      }

      // Two-phase park-then-place. The plan's window EXCLUDES the moving ids, so
      // a computed key can equal a rank a still-unmoved root holds (siblings
      // B="a1", C="a2", D="a3"; move {B,D} after C ⇒ keys ["a3","a4"], and
      // B → "a3" lands while D still sits at "a3"). The `(parent_id, rank)`
      // unique index is per-tuple, so that transient duplicate aborts the
      // transaction. Parking each root beyond its parent's max first makes the
      // final keys collision-free in any order. See `rank-park.ts`.
      await parkRanks(tx, { placements: plan.placements });

      for (const p of plan.placements) {
        await tx
          .update(_blocks)
          .set({ parentId: p.parentId, rank: p.rank, updatedAt: new Date() })
          .where(eq(_blocks.id, p.id));
      }
      if (plan.expandParentId) {
        await tx
          .update(_blocks)
          .set({ expanded: true, updatedAt: new Date() })
          .where(eq(_blocks.id, plan.expandParentId));
      }
      // Reparenting can move subtrees into a different page; recompute each.
      for (const root of plan.roots) await recomputePageIdSubtree(root, tx);
      return plan.roots;
    });

    if (roots.length === 0) return [];

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
