import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { patchBlocks } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { loadPageBlocks } from "./forest";
import { notifyStructuralChange } from "./notify-structural-change";
import { BlockLifecycle } from "./document-hooks";

/**
 * Generic minimal-change patch handler (the undo/redo inverse path). Upserts the
 * given full rows (insert-or-update by id) and deletes the given ids, all in one
 * transaction. Unlike `handleApplyBlockOp` it runs no reducer — the client has
 * already computed the exact target rows (a forward/reverse {@link BlockPatch}
 * derived from a before/after diff), so this handler is a blind, authoritative
 * row-level writer onto the CURRENT state. Reuses the same delete-path lifecycle
 * (BeforeDelete hooks + cascade-root reduction) and the shared notify/trigger
 * path as the op handler.
 */
export const handlePatchBlocks = implement(patchBlocks, async ({ params, body }) => {
  const rows = await loadPageBlocks(params.pageId);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const deleteIds = body.deleteIds;
  const deletedSet = new Set(deleteIds);
  // Only rows that actually exist can be deleted (an undo that re-deletes an
  // already-gone block is a no-op). Their cascade subtree is removed below.
  const deletedRows = rows.filter((r) => deletedSet.has(r.id));

  // --- Delete-path lifecycle (mirrors handle-apply-block-op.ts) --------------
  const afterCallbacks: Array<() => void | Promise<void>> = [];
  if (deletedRows.length > 0) {
    const ids = deletedRows.map((r) => r.id);
    for (const hook of BlockLifecycle.BeforeDelete.getContributions()) {
      const cb = await hook.beforeDelete(ids);
      if (cb) afterCallbacks.push(cb);
    }
  }

  // Delete only the roots (whose parent isn't itself being deleted) and let the
  // FK cascade clear descendants — same reduction the op handler uses.
  const rootIds = deletedRows
    .filter((r) => r.parentId === null || !deletedSet.has(r.parentId))
    .map((r) => r.id);

  // Partition upserts into inserts (id not currently present) and updates.
  // An update-only patch (the CRDT text projection) never creates rows: an
  // absent id means the row was deleted since the patch was computed (block
  // delete, history restore) — inserting it would RESURRECT the deleted block
  // with stale pre-delete text, so it is skipped deliberately.
  const inserts = body.updateOnly ? [] : body.upserts.filter((b) => !byId.has(b.id));
  const updates = body.upserts.filter((b) => byId.has(b.id));

  // A no-op update-only patch against an absent row (target deleted since the
  // patch was computed) writes nothing — don't fan out `blocksChanged`.
  const didWrite = inserts.length > 0 || updates.length > 0 || rootIds.length > 0;

  await db.transaction(async (tx) => {
    if (inserts.length > 0) {
      const now = new Date();
      await tx.insert(_blocks).values(
        inserts.map((b) => ({
          id: b.id,
          pageId: b.pageId,
          parentId: b.parentId,
          type: b.type,
          data: b.data ?? {},
          rank: b.rank.toJSON(),
          expanded: b.expanded,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    for (const b of updates) {
      await tx
        .update(_blocks)
        .set({
          pageId: b.pageId,
          parentId: b.parentId,
          type: b.type,
          data: b.data ?? {},
          rank: b.rank.toJSON(),
          expanded: b.expanded,
          updatedAt: new Date(),
        })
        .where(eq(_blocks.id, b.id));
    }

    if (rootIds.length > 0) {
      await tx.delete(_blocks).where(inArray(_blocks.id, rootIds));
    }
  });

  if (didWrite) {
    // Derive a primary type for the sidebar-refresh heuristic: any upserted
    // row's type (else a deleted row's), defaulting to a content type.
    const primaryType = body.upserts[0]?.type ?? deletedRows[0]?.type ?? "block";
    await notifyStructuralChange({ pageId: params.pageId, primaryType, deletedRows });

    // Hooks re-push state that depended on the now-deleted rows (e.g. backlinks).
    for (const cb of afterCallbacks) await cb();
  }

  const finalRows = await db
    .select()
    .from(_blocks)
    .where(eq(_blocks.pageId, params.pageId))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt));
  return { blocks: finalRows.map((r) => BlockSchema.parse(r)) };
});
