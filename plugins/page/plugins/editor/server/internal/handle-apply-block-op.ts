import { asc, eq, inArray } from "drizzle-orm";
import { db, currentTxId } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { applyBlockOpEndpoint } from "../../core/endpoints";
import { applyBlockOp, opBlockIds } from "../../core/block-ops";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { loadPageBlocks } from "./forest";
import { rowToNode, reconcileBlocks } from "./reconcile";
import { notifyStructuralChange } from "./notify-structural-change";
import { BlockLifecycle } from "./document-hooks";
import { recomputePageIdSubtree } from "./page-id";
import { blocksChanged } from "./tables-events";
import { collectBlockSubtrees } from "./collect-subtree";
import { parseBlockData } from "./parse-block-data";

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
  const deletedSet = new Set(deletedIds);
  const reducerDeletedRows = rows.filter((r) => deletedSet.has(r.id));

  // Delete roots = deleted ids whose parent is NOT itself being deleted. Deleting
  // only the roots and letting the FK `onDelete: "cascade"` clear descendants
  // avoids redundant per-row deletes (and matches handle-delete-block.ts, which
  // deletes just the root). Equivalent to deleting all `deletedIds`.
  const rootIds = reducerDeletedRows
    .filter((r) => r.parentId === null || !deletedSet.has(r.parentId))
    .map((r) => r.id);

  // The reducer enumerates each deleted block's subtree over THIS PAGE's rows.
  // That is the exact cascade set — unless a `page` row is among them: a
  // sub-page's own content is keyed `page_id = <that row>`, so `loadPageBlocks`
  // never returned it, yet the FK cascade wipes it all the same. Expand through
  // the DB in that case, so hooks (search docs, history, backlinks, attachments)
  // see everything that actually vanishes. Guarded rather than unconditional:
  // the hot merge/delete keystroke path must not pay for a `WITH RECURSIVE`.
  let deletedRows = reducerDeletedRows;
  if (reducerDeletedRows.some((r) => r.type === PAGE_BLOCK_TYPE)) {
    const cascade = await collectBlockSubtrees(rootIds);
    deletedRows = await db.select().from(_blocks).where(inArray(_blocks.id, cascade));
  }
  const cascadeIds = deletedRows.map((r) => r.id);

  // Run BeforeDelete hooks over that set so backlinks/image reconcilers can
  // snapshot state that depends on the soon-to-vanish rows, and collect their
  // after-callbacks.
  const afterCallbacks: Array<() => void | Promise<void>> = [];
  if (cascadeIds.length > 0) {
    for (const hook of BlockLifecycle.BeforeDelete.getContributions()) {
      const cb = await hook.beforeDelete(cascadeIds);
      if (cb) afterCallbacks.push(cb);
    }
  }

  const watermark = await db.transaction(async (tx) => {
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

    if (rootIds.length > 0) {
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
    return currentTxId(tx);
  });

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

  // Return the reloaded page rows (mirrors the live push payload).
  const finalRows = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.pageId, params.pageId))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt));
  return { blocks: finalRows.map((r) => BlockSchema.parse(r)), watermark };
});
