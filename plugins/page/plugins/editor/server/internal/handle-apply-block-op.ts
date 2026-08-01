import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, currentTxId } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { applyBlockOpEndpoint } from "../../core/endpoints";
import { applyBlockOp, opBlockIds } from "../../core/block-ops";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { Editor as BlockRegistry } from "./block-registry";
import { loadPageBlocks } from "./forest";
import { lockPageForWrite } from "./page-write-lock";
import { rowToNode, reconcileBlocks } from "./reconcile";
import { notifyStructuralChange } from "./notify-structural-change";
import { BlockLifecycle } from "./document-hooks";
import { recomputePageIdSubtree } from "./page-id";
import { blocksChanged } from "./tables-events";
import { parseBlockData } from "./parse-block-data";
import { deleteBlocksSubtree } from "./trash-blocks";

/**
 * Single authoritative structural edit. Load the page's blocks, run the pure
 * `applyBlockOp` reducer to compute the target tree, diff it against the loaded
 * rows, and persist the {insert, update, delete} diff in one transaction. All
 * tree/rank math lives in the reducer; this handler only diffs + persists +
 * notifies. Replaces the per-keystroke split/merge/indent/outdent handlers.
 */
/**
 * The reducer's type facts, derived from the server's OWN block registry — the
 * mirror of the web side's `useAnchorTypes()` over `Editor.Block`. Both runtimes
 * must hand `applyBlockOp` the same set: the client predicts the forest with it
 * (the optimistic overlay) and this handler commits with it, so a disagreement
 * would make an op apply differently on each side and never confirm.
 *
 * Recomputed per request rather than memoized at module eval: contributions are
 * collected at boot, well after this module is evaluated, and the set is a
 * filter over a couple of dozen handles (see `block-registry.ts` on why no eager
 * mirror lives there).
 */
function anchorTypes(): ReadonlySet<string> {
  return new Set(
    BlockRegistry.BlockData.getContributions()
      .filter((h) => h.anchor)
      .map((h) => h.type),
  );
}

/**
 * The rows this op would delete, computed from an UNLOCKED read — used ONLY to
 * decide which `BeforeDelete` hooks to run before the write transaction opens
 * (see the call site). The authoritative delete set is recomputed under the page
 * lock; this one never drives a write.
 */
function predictedDeletedRows(
  rows: Awaited<ReturnType<typeof loadPageBlocks>>,
  body: Parameters<typeof applyBlockOp>[1],
) {
  const before = rows.map(rowToNode);
  const after = applyBlockOp(before, body, { anchorTypes: anchorTypes() });
  const { deletedIds } = reconcileBlocks(before, after);
  const deletedSet = new Set(deletedIds);
  return rows.filter((r) => deletedSet.has(r.id));
}

export const handleApplyBlockOp = implement(applyBlockOpEndpoint, async ({ params, body }) => {
  // --- BeforeDelete hooks, ahead of the transaction --------------------------
  // Backlink / attachment reconcilers snapshot state that depends on the
  // soon-to-vanish rows. They run on the POOL (their own connections), so they
  // must NOT be awaited inside the write transaction: that is hold-and-wait, and
  // it stretches the connection lease — and the page write lock — over their
  // whole duration (`database/no-pool-await-in-transaction`).
  //
  // So the delete set is predicted from an UNLOCKED read here, and the
  // authoritative one is recomputed under the lock below. The two can differ only
  // if a concurrent write changes what this op deletes, in which case the hooks
  // ran over the predicted set — exactly the behaviour before the lock existed,
  // since this read is the same one the handler always used.
  const predicted = await loadPageBlocks(params.pageId);
  const predictedDeleted = predictedDeletedRows(predicted, body);
  const afterCallbacks: Array<() => void | Promise<void>> = [];
  if (
    predictedDeleted.length > 0 &&
    !predictedDeleted.some((r) => r.type === PAGE_BLOCK_TYPE)
  ) {
    const cascadeIds = predictedDeleted.map((r) => r.id);
    for (const hook of BlockLifecycle.BeforeDelete.getContributions()) {
      const cb = await hook.beforeDelete(cascadeIds);
      if (cb) afterCallbacks.push(cb);
    }
  }

  // ONE transaction spans the load, the reduce and the writes, and it opens by
  // taking this page's write lock — because this handler is a read-modify-write
  // over the whole forest and its UPDATE reasserts every column of every changed
  // row. Splitting the read from the write let a concurrent op's parentage be
  // silently overwritten by a stale snapshot; `page-write-lock.ts` documents the
  // captured interleaving. Everything that must NOT hold the lock (the hooks
  // above, the notify fan-out, the page-delete chokepoint, the final read-back)
  // stays outside it.
  const applied = await db.transaction(async (tx) => {
    await lockPageForWrite(tx, params.pageId);
    const rows = await loadPageBlocks(params.pageId, tx);
    const before = rows.map(rowToNode);
    const after = applyBlockOp(before, body, { anchorTypes: anchorTypes() });

    const { inserted, updated, deletedIds } = reconcileBlocks(before, after);

    // --- Delete-path lifecycle (mirrors handle-delete-block.ts) ----------------
    const deletedSet = new Set(deletedIds);
    const reducerDeletedRows = rows.filter((r) => deletedSet.has(r.id));

    // Delete roots = deleted ids whose parent is NOT itself being deleted. Deleting
    // only the roots and letting the FK `onDelete: "cascade"` clear descendants
    // avoids redundant per-row deletes (and matches handle-delete-block.ts, which
    // deletes just the root). Equivalent to deleting all `deletedIds`.
    const rootIds = reducerDeletedRows
      .filter((r) => r.parentId === null || !deletedSet.has(r.parentId))
      .map((r) => r.id);

    // Defensive: the reducers (`split`/`merge`/`indent`/`outdent`) already refuse
    // to delete a `type="page"` row, so this branch should never fire — but a
    // silently-cascading page here is the exact 2026-07-10 data-loss bug, so if one
    // ever slips into the delete set, route the whole delete through the trash
    // chokepoint (soft delete) instead of the inline hard delete below. The normal
    // page-free keystroke path (the overwhelming majority) stays hard and pays no
    // extra cost.
    const hasPageDelete = reducerDeletedRows.some(
      (r) => r.type === PAGE_BLOCK_TYPE,
    );
    const deletedRows = reducerDeletedRows;

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
          data: parseBlockData(node.type, node.data),
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
          data: parseBlockData(node.type, node.data),
          rank: node.rank,
          expanded: node.expanded,
          updatedAt: new Date(),
        })
        .where(eq(_blocks.id, id));
    }

    // Page-free hard delete stays inline (cascade clears descendants). A
    // page-containing set is trashed AFTER this tx via the chokepoint.
    if (rootIds.length > 0 && !hasPageDelete) {
      await tx.delete(_blocks).where(inArray(_blocks.id, rootIds));
    }

    // pageId invariant. `split` / `merge` / `indent` / `outdent` / `insert` /
    // `delete` cannot cross a page boundary, so surviving nodes keep their
    // pageId and new nodes inherit it from their parent/sibling. That is
    // ENFORCED in the reducer, not assumed: `applyIndent` and `applyMerge`
    // no-op when the previous sibling is a `page` row, `applySplit` no-ops on a
    // `page` row, and `applyOutdent` no-ops when the parent is one. Re-check
    // those guards before relying on this. Given them, the hot keystroke path
    // deliberately skips `recomputePageIdSubtree` — it is a `WITH RECURSIVE`
    // per edit.
    //
    // `move` is the exception: it is a genuine reparent, reachable through this
    // endpoint, and can carry a subtree into or out of a sub-page.
    if (body.kind === "move") {
      await recomputePageIdSubtree(body.blockId, tx);
    }

    // Ack token: the commit's xid8, read inside the write transaction (Rule A).
    return {
      watermark: await currentTxId(tx),
      before,
      after,
      deletedRows,
      rootIds,
      hasPageDelete,
    };
  });
  const { watermark, before, after, deletedRows, rootIds, hasPageDelete } = applied;

  // Route a page-containing delete through the trash chokepoint (soft delete +
  // OnTrash hooks). Runs after the insert/update tx so the reducer's other diffs
  // land first; the delete set is disjoint from the insert/update set.
  if (hasPageDelete && rootIds.length > 0) {
    await deleteBlocksSubtree(rootIds);
  }

  // --- Notify (shared with the patch handler) --------------------------------
  // The op's blocks lived on this page; derive a `type` from them (page vs
  // content) so a page edit also refreshes the sidebar; default to a content
  // type otherwise. An op can name SEVERAL blocks (a bulk indent/outdent), and a
  // sub-page row can sit anywhere in the run — so prefer `page` over position.
  // The shared helper notifies the content resource, emits `blocksChanged`, and
  // fans out per emptied sub-page in the deleted subtree.
  const touchedTypes = opBlockIds(body).flatMap((id) => {
    const type = before.find((b) => b.id === id)?.type ?? after.find((b) => b.id === id)?.type;
    return type ? [type] : [];
  });
  const primaryType =
    touchedTypes.find((t) => t === PAGE_BLOCK_TYPE) ?? touchedTypes[0] ?? "block";
  await notifyStructuralChange({ pageId: params.pageId, primaryType, deletedRows });

  // A `move` that crossed a page boundary also changed the DESTINATION page's
  // content. Fan out for it too, so its reindex subscribers (search, backlinks)
  // see the arriving subtree — the same both-scopes emit `handleMoveBlock` does.
  if (body.kind === "move") {
    const [moved] = await db
      .select({ pageId: _blocks.pageId })
      .from(_blocks)
      .where(eq(_blocks.id, body.blockId))
      .limit(1);
    if (moved && moved.pageId !== null && moved.pageId !== params.pageId) {
      await blocksChanged.emit({ pageId: moved.pageId });
    }
  }

  // Hooks re-push state that depended on the now-deleted rows (e.g. backlinks).
  for (const cb of afterCallbacks) await cb();

  // Return the reloaded LIVE page rows (mirrors the live push payload).
  const finalRows = await db
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.pageId, params.pageId), isNull(_blocks.deletedAt)))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt));
  return { blocks: finalRows.map((r) => BlockSchema.parse(r)), watermark };
});
