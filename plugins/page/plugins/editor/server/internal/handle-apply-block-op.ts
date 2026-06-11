import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { applyBlockOpEndpoint } from "../../core/endpoints";
import { applyBlockOp } from "../../core/block-ops";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { loadPageBlocks } from "./forest";
import { rowToNode, reconcileBlocks } from "./reconcile";
import { notifyBlockChange } from "./notify";
import { pagesLiveResource, blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";
import { BlockLifecycle } from "./document-hooks";

/**
 * Single authoritative structural edit. Load the page's blocks, run the pure
 * `applyBlockOp` reducer to compute the target tree, diff it against the loaded
 * rows, and persist the {insert, update, delete} diff in one transaction. All
 * tree/rank math lives in the reducer; this handler only diffs + persists +
 * notifies. Replaces the per-keystroke split/merge/indent/outdent handlers.
 */
export const handleApplyBlockOp = implement(applyBlockOpEndpoint, async ({ params, body }) => {
  const rows = await loadPageBlocks(params.pageId);
  const before = rows.map(rowToNode);
  const after = applyBlockOp(before, body);

  const { inserted, updated, deletedIds } = reconcileBlocks(before, after);

  // --- Delete-path lifecycle (mirrors handle-delete-block.ts) ----------------
  // The reducer already enumerated each deleted block's full subtree into
  // `deletedIds`, so it IS the exact set the DB delete (+ FK cascade) will wipe —
  // the same set `collectBlockSubtree` would return for a standalone delete. Run
  // BeforeDelete hooks over it so backlinks/image reconcilers can snapshot state
  // that depends on the soon-to-vanish rows, and collect their after-callbacks.
  const deletedSet = new Set(deletedIds);
  const deletedRows = rows.filter((r) => deletedSet.has(r.id));
  const deletedPages = deletedRows.filter((r) => r.type === PAGE_BLOCK_TYPE);

  const afterCallbacks: Array<() => void | Promise<void>> = [];
  if (deletedIds.length > 0) {
    for (const hook of BlockLifecycle.BeforeDelete.getContributions()) {
      const cb = await hook.beforeDelete(deletedIds);
      if (cb) afterCallbacks.push(cb);
    }
  }

  // Delete roots = deleted ids whose parent is NOT itself being deleted. Deleting
  // only the roots and letting the FK `onDelete: "cascade"` clear descendants
  // avoids redundant per-row deletes (and matches handle-delete-block.ts, which
  // deletes just the root). Equivalent to deleting all `deletedIds`.
  const rootIds = deletedRows
    .filter((r) => r.parentId === null || !deletedSet.has(r.parentId))
    .map((r) => r.id);

  await db.transaction(async (tx) => {
    if (inserted.length > 0) {
      const now = new Date();
      await tx.insert(_blocks).values(
        inserted.map((node) => ({
          id: node.id,
          // In-page ops never change pageId; new nodes carry the pageId the
          // reducer already inherited from their parent/sibling.
          pageId: node.pageId,
          parentId: node.parentId,
          type: node.type,
          data: node.data ?? {},
          rank: node.rank,
          expanded: node.expanded,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    for (const { id, node } of updated) {
      await tx
        .update(_blocks)
        .set({
          parentId: node.parentId,
          type: node.type,
          data: node.data ?? {},
          rank: node.rank,
          expanded: node.expanded,
          updatedAt: new Date(),
        })
        .where(eq(_blocks.id, id));
    }

    if (rootIds.length > 0) {
      await tx.delete(_blocks).where(inArray(_blocks.id, rootIds));
    }
  });

  // pageId invariant: every op here is single-block and in-page — surviving nodes
  // keep their pageId and new nodes inherit it from their parent/sibling. So we
  // deliberately DO NOT call recomputePageIdSubtree (only cross-page moves need
  // it, and those go through the dedicated moveBlock endpoint).

  // --- Notify (mirrors handle-delete-block.ts / notify.ts) -------------------
  // The op's primary block lived on this page; notify its content resource and
  // emit `blocksChanged` so links/image reindexers refresh. Derive a `type` from
  // the op's primary block (page vs content) so a page edit also refreshes the
  // sidebar; default to a content type otherwise.
  const primaryId =
    "blockId" in body ? body.blockId : "newId" in body ? body.newId : null;
  const primaryType =
    (primaryId ? before.find((b) => b.id === primaryId)?.type : undefined) ??
    after.find((b) => b.id === primaryId)?.type ??
    "block";
  await notifyBlockChange({ pageId: params.pageId, type: primaryType });

  // Any page inside the deleted subtree leaves the sidebar and its content
  // resource is now empty — refresh once for the sidebar and per emptied page.
  if (deletedPages.length > 0) {
    pagesLiveResource.notify();
    for (const p of deletedPages) {
      blocksLiveResource.notify({ pageId: p.id });
      await blocksChanged.emit({ pageId: p.id });
    }
  }

  // Hooks re-push state that depended on the now-deleted rows (e.g. backlinks).
  for (const cb of afterCallbacks) await cb();

  // Return the reloaded page rows (mirrors the live push payload).
  const finalRows = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.pageId, params.pageId))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt));
  return { blocks: finalRows.map((r) => BlockSchema.parse(r)) };
});
