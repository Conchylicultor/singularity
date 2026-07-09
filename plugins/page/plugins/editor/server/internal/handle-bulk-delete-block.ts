import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { bulkDeleteBlocks } from "../../core/endpoints";
import { _blocks } from "./tables";
import { collectBlockSubtrees } from "./collect-subtree";
import { notifyStructuralChange } from "./notify-structural-change";
import { BlockLifecycle } from "./document-hooks";

export const handleBulkDeleteBlock = implement(
  bulkDeleteBlocks,
  async ({ params, body }) => {
    if (body.ids.length === 0) return { deleted: 0 };

    // Only ids that live on this page may be deletion roots — the page scope is
    // the guard that keeps a stray id from reaching into another page.
    const roots = await db
      .select({ id: _blocks.id, type: _blocks.type })
      .from(_blocks)
      .where(and(eq(_blocks.pageId, params.pageId), inArray(_blocks.id, body.ids)));
    if (roots.length === 0) return { deleted: 0 };

    // The DELETE below removes only the roots and lets the FK cascade clear
    // their descendants. Snapshot that FULL set — the cascade crosses page
    // boundaries, so a selected `type="page"` root takes its whole sub-page's
    // content with it — and run the BeforeDelete hooks over it, exactly as the
    // single-delete and op handlers do. Without this pass, search documents,
    // version history, backlinks and attachments are orphaned on every bulk
    // delete.
    const subtreeIds = await collectBlockSubtrees(roots.map((r) => r.id));
    const deletedRows = await db
      .select()
      .from(_blocks)
      .where(inArray(_blocks.id, subtreeIds));

    const afterCallbacks: Array<() => void | Promise<void>> = [];
    for (const hook of BlockLifecycle.BeforeDelete.getContributions()) {
      const cb = await hook.beforeDelete(subtreeIds);
      if (cb) afterCallbacks.push(cb);
    }

    // A single DELETE..IN is atomic; FK cascade removes any descendants that
    // weren't themselves listed.
    const deleted = await db
      .delete(_blocks)
      .where(inArray(_blocks.id, roots.map((r) => r.id)))
      .returning({ id: _blocks.id });

    // Fans out `blocksChanged` for this page, plus one per emptied sub-page in
    // the deleted subtree.
    await notifyStructuralChange({
      pageId: params.pageId,
      primaryType: roots[0]!.type,
      deletedRows,
    });

    // Hooks re-push state that depended on the now-deleted rows (e.g. backlinks).
    for (const cb of afterCallbacks) await cb();

    return { deleted: deleted.length };
  },
);
