import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { applyBlockOpEndpoint } from "../../core/endpoints";
import { applyBlockOp, opBlockIds, type BlockNode } from "../../core/block-ops";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { Editor as BlockRegistry } from "./block-registry";
import { withPageForest } from "./page-forest";
import { writeForestTarget } from "./forest-writer";
import { rowToNode } from "./reconcile";
import { notifyStructuralChange } from "./notify-structural-change";
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
 * `move` / `bulkMove` mint their rank IN THE REDUCER, from the sibling set of
 * the forest handed to it — this page's. So the destination's sibling space must
 * lie inside this page, or the key is arithmetic over a partial list and
 * collides with the siblings it cannot see (the same hazard
 * `MoveBlockBodySchema` and `planBulkMove`'s `destSiblings` doc name).
 *
 * Exactly two destinations qualify: the page's own top level, and a NON-page row
 * of this page. A sub-page row's children are keyed to that sub-page and are
 * absent from a page-scoped load, so it is refused here — a cross-page drop is
 * not one page's op, and the composite client store routes it to the id-scoped
 * `moveBlock` endpoint, which locks both forests.
 *
 * A loud 400, never a silent clamp: a request reaching here with an out-of-page
 * destination means a client computed an intent this endpoint cannot honour.
 */
function assertDestinationInPage(
  rows: BlockNode[],
  pageId: string,
  parentId: string | null,
): void {
  if (parentId === pageId) return;
  const parent = parentId === null ? undefined : rows.find((r) => r.id === parentId);
  if (!parent || parent.type === PAGE_BLOCK_TYPE) {
    throw new HttpError(
      400,
      `Destination parent ${parentId ?? "null"} is not inside page ${pageId}; ` +
        `a cross-page move must use POST /api/blocks/:id/move`,
    );
  }
}

export const handleApplyBlockOp = implement(applyBlockOpEndpoint, async ({ params, body }) => {
  // ONE locked transaction spans the load, the reduce and the writes, because
  // this handler is a read-modify-write over the whole forest and its UPDATE
  // reasserts every column of every changed row. `withPageForest` is what makes
  // "the read is under the lock" true by construction — `ctx.forest()` is the
  // only way to read, and it exists only inside the transaction. Everything that
  // must NOT hold the lock (the delete hooks' re-push callbacks, the notify
  // fan-out, the page-delete chokepoint, the final read-back) runs after it.
  const { value, watermark } = await withPageForest(params.pageId, async (ctx) => {
    const rows = await ctx.forest();
    const before = rows.map(rowToNode);
    if (body.kind === "move" || body.kind === "bulkMove") {
      assertDestinationInPage(before, params.pageId, body.parentId);
    }
    const after = applyBlockOp(before, body, { anchorTypes: anchorTypes() });

    // Reconciles, persists, and dispatches `OnDelete` over the AUTHORITATIVE
    // delete set — the one this transaction really removes. There is no longer a
    // predicted set read outside the lock, so there is nothing for the two to
    // disagree about.
    const write = await writeForestTarget(ctx, before, after);

    // pageId invariant: NO op reachable through this endpoint crosses a page
    // boundary, so surviving nodes keep their pageId and new nodes inherit it
    // from their parent/sibling — and the hot keystroke path can skip
    // `recomputePageIdSubtree` entirely (it is a `WITH RECURSIVE` per edit).
    //
    // That is ENFORCED, not assumed, and re-check both halves before relying on
    // it: the reducer no-ops when a `page` row would be crossed (`applyIndent`
    // and `applyMerge` on a `page` previous sibling, `applySplit` on a `page`
    // row, `applyOutdent` on a `page` parent), and the reparenting ops (`move`,
    // `bulkMove`) are refused above unless their destination is inside this
    // page. A cross-page move is `handleMoveBlock`'s, which locks both forests
    // and does recompute.

    return { before, after, write };
  });
  const { before, after, write } = value;

  // Route a page-containing delete through the trash chokepoint (soft delete +
  // OnTrash hooks). Runs after the write transaction so the reducer's other
  // diffs land first; the delete set is disjoint from the insert/update set, and
  // the chokepoint takes the page locks it needs itself.
  if (write.deferredPageDelete && write.deleteRootIds.length > 0) {
    await deleteBlocksSubtree(write.deleteRootIds);
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
  await notifyStructuralChange({
    pageId: params.pageId,
    primaryType,
    deletedRows: write.deletedRows,
  });

  // Return the reloaded LIVE page rows (mirrors the live push payload).
  const finalRows = await db
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.pageId, params.pageId), isNull(_blocks.deletedAt)))
    .orderBy(asc(_blocks.rank), asc(_blocks.createdAt));
  return { blocks: finalRows.map((r) => BlockSchema.parse(r)), watermark };
});
