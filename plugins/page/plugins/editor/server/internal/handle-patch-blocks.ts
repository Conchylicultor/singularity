import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { patchBlocks } from "../../core/endpoints";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { loadPageBlocks } from "./forest";
import { notifyStructuralChange } from "./notify-structural-change";
import { BlockLifecycle } from "./document-hooks";
import { parkRanks, pairChanged } from "./rank-park";

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

  // --- Page-type transition guard -------------------------------------------
  // A `page` row owns every row keyed `page_id = <its id>`. Flipping it to a
  // content type would leave that content unreachable by any query, forever;
  // flipping a content row INTO a page would claim no content and leave its
  // existing children mis-scoped (their `page_id` still names the outer page).
  // Neither is expressible as a row-level patch — the only sanctioned in-place
  // transition into `page` is `POST /api/blocks/:id/turn-into-page`, which
  // reparents the descendants' `page_id` in the same transaction. Fail loudly
  // rather than silently orphan.
  for (const b of updates) {
    const before = byId.get(b.id)!;
    if (before.type === b.type) continue;
    if (before.type === PAGE_BLOCK_TYPE || b.type === PAGE_BLOCK_TYPE) {
      throw new HttpError(
        409,
        `Cannot change block ${b.id} from type "${before.type}" to "${b.type}": ` +
          `a "${PAGE_BLOCK_TYPE}" row scopes its own content by page_id. ` +
          `Use POST /api/blocks/:id/turn-into-page.`,
      );
    }
  }

  // Rows whose `(parentId, rank)` pair moves must be parked before the final
  // writes land — see `rank-park.ts`. This is a blind writer: undoing a swap
  // hands two rows each other's ranks, which the per-tuple `(parent_id, rank)`
  // unique index would reject mid-loop.
  const reranked = updates.flatMap((b) => {
    const before = byId.get(b.id)!;
    const next = { parentId: b.parentId, rank: b.rank.toJSON() };
    if (!pairChanged(before, next)) return [];
    return [{ id: b.id, currentParentId: before.parentId, ...next }];
  });
  const incoming = inserts.map((b) => ({
    parentId: b.parentId,
    rank: b.rank.toJSON(),
  }));

  // A no-op update-only patch against an absent row (target deleted since the
  // patch was computed) writes nothing — don't fan out `blocksChanged`.
  const didWrite = inserts.length > 0 || updates.length > 0 || rootIds.length > 0;

  await db.transaction(async (tx) => {
    // Vacate the `(parent_id, rank)` pairs this patch reassigns before anything
    // claims them. Parking runs first so the inserts below can take a pair a
    // re-ranked row is moving off (and so a swap-undo never trips the per-tuple
    // unique index mid-loop). Parking only bumps `rank`, never `parent_id`, so
    // it cannot depend on a row `inserts` has not created yet.
    await parkRanks(tx, { placements: reranked, incoming });

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
