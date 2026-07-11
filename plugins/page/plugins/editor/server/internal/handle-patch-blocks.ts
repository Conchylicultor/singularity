import { and, asc, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db, currentTxId } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { TrashEntrySchema } from "@plugins/infra/plugins/trash/core";
import { _trashEntries } from "@plugins/infra/plugins/trash/server";
import { patchBlocks } from "../../core/endpoints";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { loadPageBlocks } from "./forest";
import { notifyStructuralChange } from "./notify-structural-change";
import { BlockLifecycle } from "./document-hooks";
import { parkRanks, pairChanged } from "./rank-park";
import { parseBlockData } from "./parse-block-data";
import { untrashBlocks, deleteBlocksSubtree } from "./trash-blocks";

/**
 * Generic minimal-change patch handler (the undo/redo inverse path). Upserts the
 * given full rows (insert-or-update by id) and deletes the given ids, all in one
 * transaction. Unlike `handleApplyBlockOp` it runs no reducer — the client has
 * already computed the exact target rows (a forward/reverse {@link BlockPatch}
 * derived from a before/after diff), so this handler is a blind, authoritative
 * row-level writer onto the CURRENT state.
 *
 * Trash symmetry (zero client changes):
 *  - **Un-trash-on-upsert.** `loadPageBlocks` now excludes trashed rows, so an
 *    upsert whose id matches a TRASHED row would misclassify as an insert → PK
 *    conflict. The three-way partition catches it: a trashed page-shell upsert
 *    restores its WHOLE subtree via the trash chokepoint (CRDT docs + history
 *    survived, so the restore is byte-exact); a trashed content-row upsert just
 *    clears its flags and applies the client's row data. Cmd+Z after a page
 *    delete thereby restores the full subtree.
 *  - **Re-trash-on-redo.** A `deleteIds` containing a `type="page"` root routes
 *    back through the chokepoint (a fresh trash entry); page-free stays hard.
 */
export const handlePatchBlocks = implement(patchBlocks, async ({ params, body }) => {
  const rows = await loadPageBlocks(params.pageId);
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Upserts whose id is not a LIVE row on this page are either a fresh INSERT or
  // an UNTRASH (the id matches a soft-deleted row — undo of a delete). One query
  // resolves which.
  const missingIds = body.upserts.filter((b) => !byId.has(b.id)).map((b) => b.id);
  const trashedRows =
    missingIds.length > 0
      ? await db
          .select()
          .from(_blocks)
          .where(and(inArray(_blocks.id, missingIds), isNotNull(_blocks.deletedAt)))
      : [];
  const trashedById = new Map(trashedRows.map((r) => [r.id, r]));

  // Three-way partition: update (live), untrash (trashed), insert (neither).
  const updates = body.upserts.filter((b) => byId.has(b.id));
  const pageUntrash = body.upserts.filter(
    (b) => trashedById.get(b.id)?.type === PAGE_BLOCK_TYPE,
  );
  const nonPageUntrash = body.upserts.filter((b) => {
    const t = trashedById.get(b.id);
    return t !== undefined && t.type !== PAGE_BLOCK_TYPE;
  });
  const inserts = body.updateOnly
    ? []
    : body.upserts.filter((b) => !byId.has(b.id) && !trashedById.has(b.id));

  // --- Un-trash a page root: restore its whole entry via the chokepoint, then
  // consume the now-empty ledger row. Done before the main tx; the restored
  // subtree is disjoint from this page's own rows except the shell, which
  // untrashBlocks re-links (and re-ranks on collision). Its content docs +
  // version history survived the trash, so nothing is re-seeded.
  for (const b of pageUntrash) {
    const entryId = trashedById.get(b.id)!.trashEntryId;
    if (entryId === null) continue;
    const [entryRow] = await db
      .select()
      .from(_trashEntries)
      .where(eq(_trashEntries.id, entryId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!entryRow) continue;
    await untrashBlocks(TrashEntrySchema.parse(entryRow));
    await db.delete(_trashEntries).where(eq(_trashEntries.id, entryId));
  }

  // --- Delete path -----------------------------------------------------------
  const deleteIds = body.deleteIds;
  const deletedSet = new Set(deleteIds);
  // Only rows that actually exist (and are live) can be deleted here.
  const deletedRows = rows.filter((r) => deletedSet.has(r.id));
  const hasPageDelete = deletedRows.some((r) => r.type === PAGE_BLOCK_TYPE);
  // Delete roots = deleted ids whose parent isn't itself being deleted.
  const deleteRootIds = deletedRows
    .filter((r) => r.parentId === null || !deletedSet.has(r.parentId))
    .map((r) => r.id);

  // Page-free delete → run BeforeDelete hooks + inline hard delete below. A
  // page-containing delete re-routes through the chokepoint (re-trash), which
  // runs the lifecycle hooks itself.
  const afterCallbacks: Array<() => void | Promise<void>> = [];
  if (!hasPageDelete && deletedRows.length > 0) {
    const ids = deletedRows.map((r) => r.id);
    for (const hook of BlockLifecycle.BeforeDelete.getContributions()) {
      const cb = await hook.beforeDelete(ids);
      if (cb) afterCallbacks.push(cb);
    }
  }

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

  const didWrite =
    inserts.length > 0 ||
    updates.length > 0 ||
    nonPageUntrash.length > 0 ||
    pageUntrash.length > 0 ||
    deleteRootIds.length > 0;

  const watermark = await db.transaction(async (tx) => {
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
          data: parseBlockData(b.type, b.data),
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
          data: parseBlockData(b.type, b.data),
          rank: b.rank.toJSON(),
          expanded: b.expanded,
          updatedAt: new Date(),
        })
        .where(eq(_blocks.id, b.id));
    }

    // Un-trash a content row: clear its flags and apply the client's row data
    // (its old slot was freed when it was trashed, so no re-park is needed).
    for (const b of nonPageUntrash) {
      await tx
        .update(_blocks)
        .set({
          deletedAt: null,
          trashEntryId: null,
          pageId: b.pageId,
          parentId: b.parentId,
          type: b.type,
          data: parseBlockData(b.type, b.data),
          rank: b.rank.toJSON(),
          expanded: b.expanded,
          updatedAt: new Date(),
        })
        .where(eq(_blocks.id, b.id));
    }

    if (deleteRootIds.length > 0 && !hasPageDelete) {
      await tx.delete(_blocks).where(inArray(_blocks.id, deleteRootIds));
    }

    // Ack token: the commit's xid8, read inside the write transaction (Rule A).
    return currentTxId(tx);
  });

  // Re-trash a page root (redo of a page delete) via the chokepoint, after the
  // main tx so its inserts/updates land first.
  if (hasPageDelete && deleteRootIds.length > 0) {
    await deleteBlocksSubtree(deleteRootIds);
  }

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
    .where(and(eq(_blocks.pageId, params.pageId), isNull(_blocks.deletedAt)))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt));
  return { blocks: finalRows.map((r) => BlockSchema.parse(r)), watermark };
});
