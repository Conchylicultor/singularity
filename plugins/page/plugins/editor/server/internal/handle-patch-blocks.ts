import { and, asc, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db, currentTxId } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { TrashEntrySchema } from "@plugins/infra/plugins/trash/core";
import { _trashEntries } from "@plugins/infra/plugins/trash/server";
import { patchBlocks } from "../../core/endpoints";
import { namesField, type BlockFieldChanges } from "../../core/block-diff";
import { BlockSchema, PAGE_BLOCK_TYPE, type Block } from "../../core/schemas";
import { _blocks } from "./tables";
import { loadPageBlocks } from "./forest";
import { lockPageForWrite } from "./page-write-lock";
import { notifyStructuralChange } from "./notify-structural-change";
import { BlockLifecycle } from "./document-hooks";
import { parkRanks, pairChanged } from "./rank-park";
import { parseBlockData } from "./parse-block-data";
import { untrashBlocks, deleteBlocksSubtree } from "./trash-blocks";

/**
 * Generic minimal-change patch handler (the undo/redo inverse path). Creates the
 * given full rows, applies each update's NAMED fields, and deletes the given
 * ids, all in one transaction. Unlike `handleApplyBlockOp` it runs no reducer —
 * the client has already computed the exact changes (a forward/reverse
 * {@link BlockPatch} derived from a before/after diff), so this handler is an
 * authoritative row-level writer onto the CURRENT state.
 *
 * Two invariants make it safe to be blind:
 *  - **An update writes only the columns it names.** A writer that owns one
 *    field cannot restate — and therefore cannot clobber — a field a concurrent
 *    writer owns. The `data.text` projection says `data` and nothing else, so it
 *    can no longer push a stale `type` over a conversion the user just made.
 *  - **An update never creates.** A patch whose target row is gone is a skip, by
 *    definition — which is what keeps a debounced projection flush racing a
 *    history restore from resurrecting a deleted block. Only `creates` may bring
 *    a row into existence (or back: an id matching a soft-deleted row untrashes).
 *
 * Trash symmetry (zero client changes):
 *  - **Un-trash-on-create.** `loadPageBlocks` excludes trashed rows, so a create
 *    whose id matches a TRASHED row would misclassify as an insert → PK conflict.
 *    The partition catches it: a trashed page-shell create restores its WHOLE
 *    subtree via the trash chokepoint (CRDT docs + history survived, so the
 *    restore is byte-exact); a trashed content-row create just clears its flags
 *    and applies the client's row. Cmd+Z after a page delete thereby restores the
 *    full subtree.
 *  - **Re-trash-on-redo.** A `deleteIds` containing a `type="page"` root routes
 *    back through the chokepoint (a fresh trash entry); page-free stays hard.
 */
export const handlePatchBlocks = implement(patchBlocks, async ({ params, body }) => {
  const rows = await loadPageBlocks(params.pageId);
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Creates whose id is not a LIVE row on this page are either a fresh INSERT or
  // an UNTRASH (the id matches a soft-deleted row — undo of a delete). One query
  // resolves which.
  const missingIds = body.creates.filter((b) => !byId.has(b.id)).map((b) => b.id);
  const trashedRows =
    missingIds.length > 0
      ? await db
          .select()
          .from(_blocks)
          .where(and(inArray(_blocks.id, missingIds), isNotNull(_blocks.deletedAt)))
      : [];
  const trashedById = new Map(trashedRows.map((r) => [r.id, r]));

  const pageUntrash = body.creates.filter(
    (b) => trashedById.get(b.id)?.type === PAGE_BLOCK_TYPE,
  );
  const nonPageUntrash = body.creates.filter((b) => {
    const t = trashedById.get(b.id);
    return t !== undefined && t.type !== PAGE_BLOCK_TYPE;
  });
  const inserts = body.creates.filter((b) => !byId.has(b.id) && !trashedById.has(b.id));
  // A create landing on a row that is ALREADY live: an idempotent re-assert of
  // the whole row (a replayed undo-of-delete whose row came back by another
  // path). A create IS the full state, so write every column — mirroring
  // `applyPatch`, where the create likewise wins outright over the base row.
  const createOverwrites = body.creates.filter((b) => byId.has(b.id));

  // An update naming a row that is not live is a skip — see the header.
  const updates = body.updates.filter((u) => byId.has(u.id));

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
  // rather than silently orphan. Only writes that NAME `type` can trip it: an
  // update that says nothing about `type` cannot change one.
  const typeWrites: { id: string; from: string; to: string }[] = [
    ...updates.flatMap((u) =>
      namesField(u.changes, "type")
        ? [{ id: u.id, from: byId.get(u.id)!.type, to: u.changes.type! }]
        : [],
    ),
    ...createOverwrites.map((b) => ({ id: b.id, from: byId.get(b.id)!.type, to: b.type })),
  ];
  for (const t of typeWrites) {
    if (t.from === t.to) continue;
    if (t.from === PAGE_BLOCK_TYPE || t.to === PAGE_BLOCK_TYPE) {
      throw new HttpError(
        409,
        `Cannot change block ${t.id} from type "${t.from}" to "${t.to}": ` +
          `a "${PAGE_BLOCK_TYPE}" row scopes its own content by page_id. ` +
          `Use POST /api/blocks/:id/turn-into-page.`,
      );
    }
  }

  // Rows whose `(parentId, rank)` pair moves must be parked before the final
  // writes land — see `rank-park.ts`. This is a blind writer: undoing a swap
  // hands two rows each other's ranks, which the per-tuple `(parent_id, rank)`
  // unique index would reject mid-loop. A write that names NEITHER `parentId`
  // nor `rank` leaves the pair where it is, so it needs no park at all.
  const reranked = [
    ...updates.map((u) => ({ id: u.id, changes: u.changes })),
    // A create asserts the whole row, so it always names both halves of the pair.
    ...createOverwrites.map((b) => ({
      id: b.id,
      changes: { parentId: b.parentId, rank: b.rank } satisfies BlockFieldChanges,
    })),
  ].flatMap(({ id, changes }) => {
    const before = byId.get(id)!;
    const next = {
      parentId: namesField(changes, "parentId") ? changes.parentId! : before.parentId,
      rank: namesField(changes, "rank") ? changes.rank!.toJSON() : before.rank,
    };
    if (!pairChanged(before, next)) return [];
    return [{ id, currentParentId: before.parentId, ...next }];
  });
  const incoming = inserts.map((b) => ({
    parentId: b.parentId,
    rank: b.rank.toJSON(),
  }));

  const didWrite =
    inserts.length > 0 ||
    updates.length > 0 ||
    createOverwrites.length > 0 ||
    nonPageUntrash.length > 0 ||
    pageUntrash.length > 0 ||
    deleteRootIds.length > 0;

  /** Every column of a full row — what a create asserts. */
  const fullRow = (b: Block) => ({
    pageId: b.pageId,
    parentId: b.parentId,
    type: b.type,
    data: parseBlockData(b.type, b.data),
    rank: b.rank.toJSON(),
    expanded: b.expanded,
    updatedAt: new Date(),
  });

  const watermark = await db.transaction(async (tx) => {
    // Take the page's write lock, the same one `handleApplyBlockOp` holds across
    // its read-modify-write. This handler is a BLIND writer (its values come from
    // the client, not from the read above), so it needs no atomic read of its
    // own — but the op handler does, and without this its window would still be
    // open to a patch: a `convertTo` patch committing between an op's read and
    // its write left the op reasserting the pre-convert `type`, which is how a
    // bullet typed immediately after an Enter turned back into a paragraph.
    await lockPageForWrite(tx, params.pageId);
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

    for (const b of createOverwrites) {
      await tx.update(_blocks).set(fullRow(b)).where(eq(_blocks.id, b.id));
    }

    for (const u of updates) {
      const before = byId.get(u.id)!;
      const changes = u.changes;
      // ONLY the named columns. `parseBlockData` validates against the
      // EFFECTIVE type, which is the point of the two-way split below:
      //  - `data` named → validate it against the type this write leaves the row
      //    at (the new one when `type` is also named, else the STORED one);
      //  - `type` named alone → the stored blob's validity is now judged by a
      //    different schema, so re-validate (and re-mint) it against the new
      //    type. A blob the target type rejects is a loud 400 here rather than
      //    an unreadable row later.
      const type = namesField(changes, "type") ? changes.type! : before.type;
      const set: Partial<typeof _blocks.$inferInsert> = { updatedAt: new Date() };
      if (namesField(changes, "parentId")) set.parentId = changes.parentId!;
      if (namesField(changes, "rank")) set.rank = changes.rank!.toJSON();
      if (namesField(changes, "expanded")) set.expanded = changes.expanded!;
      if (namesField(changes, "type")) set.type = changes.type!;
      if (namesField(changes, "data")) set.data = parseBlockData(type, changes.data);
      else if (namesField(changes, "type")) set.data = parseBlockData(type, before.data);
      await tx.update(_blocks).set(set).where(eq(_blocks.id, u.id));
    }

    // Un-trash a content row: clear its flags and apply the client's row
    // (its old slot was freed when it was trashed, so no re-park is needed).
    for (const b of nonPageUntrash) {
      await tx
        .update(_blocks)
        .set({ deletedAt: null, trashEntryId: null, ...fullRow(b) })
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
    // Derive a primary type for the sidebar-refresh heuristic: any created
    // row's type, else a type this patch writes, else the STORED type of an
    // updated row (an update that doesn't name `type` doesn't change it), else
    // a deleted row's — defaulting to a content type.
    const primaryType =
      body.creates[0]?.type ??
      (updates[0] ? byId.get(updates[0].id)!.type : undefined) ??
      deletedRows[0]?.type ??
      "block";
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
