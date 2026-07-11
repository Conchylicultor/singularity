import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { bulkDeleteBlocks } from "../../core/endpoints";
import { _blocks } from "./tables";
import { notifyStructuralChange } from "./notify-structural-change";
import { deleteBlocksSubtree } from "./trash-blocks";

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

    // The single delete chokepoint (the 2026-07-10 incident path). If the
    // collected cascade set contains any `type="page"` block — a selected
    // sub-page — the whole selection is TRASHED (soft delete), so each sub-page's
    // cross-page content, page_block_docs, and history survive and Cmd+Z restores
    // the full subtree; a page-free selection is hard-deleted as before. It runs
    // the BeforeDelete / OnTrash lifecycle hooks over the full set.
    await deleteBlocksSubtree(roots.map((r) => r.id));

    // Fan out `blocksChanged` for this page, plus one per removed sub-page in the
    // deleted set. The `type="page"` roots drive the per-sub-page emit whether the
    // delete trashed or hard-deleted them.
    await notifyStructuralChange({
      pageId: params.pageId,
      primaryType: roots[0]!.type,
      deletedRows: roots,
    });

    return { deleted: roots.length };
  },
);
