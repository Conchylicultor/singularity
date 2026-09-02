import { and, asc, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { TrashEntrySchema } from "@plugins/infra/plugins/trash/core";
import { _trashEntries } from "@plugins/infra/plugins/trash/server";
import { patchBlocks } from "../../core/endpoints";
import { namesField, type BlockPatch } from "../../core/block-diff";
import { BlockSchema, PAGE_BLOCK_TYPE, type Block } from "../../core/schemas";
import { _blocks } from "./tables";
import { withPageForest } from "./page-forest";
import { writeBlockPatch, type ResolvedBlockPatch } from "./forest-writer";
import { notifyStructuralChange } from "./notify-structural-change";
import { untrashBlocks, deleteBlocksSubtree } from "./trash-blocks";

/**
 * Generic minimal-change patch applier (the undo/redo inverse path). Creates the
 * given full rows, applies each update's NAMED fields, and deletes the given
 * ids, all in one locked transaction. Unlike `handleApplyBlockOp` it runs no
 * reducer — the caller has already computed the exact changes (a forward/reverse
 * {@link BlockPatch} derived from a before/after diff), so this is an
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
 *  - **Un-trash-on-create.** The locked forest read excludes trashed rows, so a
 *    create whose id matches a TRASHED row would misclassify as an insert → PK
 *    conflict. The partition catches it: a trashed page-shell create restores its
 *    WHOLE subtree via the trash chokepoint (CRDT docs + history survived, so the
 *    restore is byte-exact); a trashed content-row create just clears its flags
 *    and applies the patch's row. Cmd+Z after a page delete thereby restores the
 *    full subtree.
 *  - **Re-trash-on-redo.** A `deleteIds` containing a `type="page"` root routes
 *    back through the chokepoint (a fresh trash entry); page-free stays hard.
 *
 * Exported (not merely the endpoint's body) because it is THE sanctioned forest
 * write: `page-editor/no-adhoc-forest-write` forbids any other plugin touching
 * `_blocks`, so a server-side writer that computes its own `BlockPatch` — today
 * `page/markdown-apply`, which diffs an incoming markdown document against the
 * stored forest — routes through this one path rather than growing a second.
 */
export async function applyPageBlockPatch(
  pageId: string,
  patch: BlockPatch,
): Promise<{ blocks: Block[]; watermark: string }> {
  // Which of this patch's creates land on a TRASHED row. Resolvable without the
  // page read (a live row is never `deleted_at IS NOT NULL`), which is what lets
  // the page-root restore below run BEFORE the write transaction opens — it is
  // its own locked write via the chokepoint, and nesting one lock inside another
  // would take them out of the sorted order that keeps writers deadlock-free.
  const createIds = patch.creates.map((b) => b.id);
  const trashedRows =
    createIds.length > 0
      ? await db
          .select()
          .from(_blocks)
          .where(
            and(inArray(_blocks.id, createIds), isNotNull(_blocks.deletedAt)),
          )
      : [];
  const trashedById = new Map(trashedRows.map((r) => [r.id, r]));
  // A trashed PAGE shell is restored wholesale by the chokepoint below, which
  // owns its parentage and repairs a rank its slot lost while it was trashed.
  // The patch must therefore not also re-assert its own row over it — that
  // would put back the very `(parent_id, rank)` the repair moved off, and the
  // live unique index would reject it. So these ids are excluded from every
  // write bucket.
  const pageUntrashIds = new Set(
    patch.creates
      .filter((b) => trashedById.get(b.id)?.type === PAGE_BLOCK_TYPE)
      .map((b) => b.id),
  );
  const creates = patch.creates.filter((b) => !pageUntrashIds.has(b.id));

  // --- Un-trash a page root: restore its whole entry via the chokepoint, then
  // consume the now-empty ledger row. The restored subtree is disjoint from this
  // page's own rows except the shell, which untrashBlocks re-links (and re-ranks
  // on collision). Its content docs + version history survived the trash, so
  // nothing is re-seeded.
  for (const b of patch.creates) {
    const trashed = trashedById.get(b.id);
    if (trashed?.type !== PAGE_BLOCK_TYPE) continue;
    const entryId = trashed.trashEntryId;
    if (entryId === null) continue;
    const [entryRow] = await db
      .select()
      .from(_trashEntries)
      .where(eq(_trashEntries.id, entryId))
      .limit(1);
    if (!entryRow) continue;
    await untrashBlocks(TrashEntrySchema.parse(entryRow));
    await db.delete(_trashEntries).where(eq(_trashEntries.id, entryId));
  }

  const { value, watermark } = await withPageForest(pageId, async (ctx) => {
    // The forest read is INSIDE the lock. This is a BLIND writer (its values
    // come from the caller, not from this read), so it needs no atomic read of
    // its own — but the op handler does, and without this lock its window
    // would still be open to a patch: a `convertTo` patch committing
    // between an op's read and its write left the op reasserting the pre-convert
    // `type`, which is how a bullet typed immediately after an Enter turned back
    // into a paragraph.
    const rows = await ctx.forest();
    const stored = new Map(rows.map((r) => [r.id, r]));

    // Un-trash a CONTENT row: clear its flags and apply the patch's row.
    const untrashes = creates.filter(
      (b) => !stored.has(b.id) && trashedById.has(b.id),
    );
    const inserts = creates.filter(
      (b) => !stored.has(b.id) && !trashedById.has(b.id),
    );
    // A create landing on a row that is ALREADY live: an idempotent re-assert of
    // the whole row (a replayed undo-of-delete whose row came back by another
    // path). A create IS the full state, so write every column — mirroring
    // `applyPatch`, where the create likewise wins outright over the base row.
    const overwrites = creates.filter((b) => stored.has(b.id));

    // An update naming a row that is not live is a skip — see the header.
    const updates = patch.updates.filter((u) => stored.has(u.id));

    // --- Delete path ---------------------------------------------------------
    const deletedSet = new Set(patch.deleteIds);
    const deletedRows = rows
      .filter((r) => deletedSet.has(r.id))
      .map((r) => ({
        id: r.id,
        type: r.type,
        pageId: r.pageId,
        parentId: r.parentId,
      }));

    // --- Page-type transition guard -----------------------------------------
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
          ? [{ id: u.id, from: stored.get(u.id)!.type, to: u.changes.type! }]
          : [],
      ),
      ...overwrites.map((b) => ({
        id: b.id,
        from: stored.get(b.id)!.type,
        to: b.type,
      })),
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

    const resolved: ResolvedBlockPatch = {
      inserts,
      overwrites,
      untrashes,
      updates,
      stored,
      deletedRows,
    };
    const write = await writeBlockPatch(ctx, resolved);

    const didWrite =
      inserts.length > 0 ||
      updates.length > 0 ||
      overwrites.length > 0 ||
      untrashes.length > 0 ||
      pageUntrashIds.size > 0 ||
      write.deleteRootIds.length > 0;

    return { write, didWrite };
  });
  const { write, didWrite } = value;

  // Re-trash a page root (redo of a page delete) via the chokepoint, after the
  // write transaction so its inserts/updates land first.
  if (write.deferredPageDelete && write.deleteRootIds.length > 0) {
    await deleteBlocksSubtree(write.deleteRootIds);
  }

  if (didWrite) {
    await notifyStructuralChange({
      pageId,
      deletedRows: write.deletedRows,
    });
  }

  const finalRows = await db
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.pageId, pageId), isNull(_blocks.deletedAt)))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt));
  return { blocks: finalRows.map((r) => BlockSchema.parse(r)), watermark };
}

/** The HTTP face of {@link applyPageBlockPatch} — validation and nothing else. */
export const handlePatchBlocks = implement(patchBlocks, ({ params, body }) =>
  applyPageBlockPatch(params.pageId, body),
);
