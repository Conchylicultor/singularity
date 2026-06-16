import { db } from "@plugins/database/server";
import { _blocks, PAGE_BLOCK_TYPE, type BlockDeleteHook } from "@plugins/page/plugins/editor/server";
import { inArray, and, eq } from "drizzle-orm";
import { deleteSearchDocs } from "@plugins/search/plugins/engine/server";

// Deleting a page (a `type="page"` block) FK-cascade-wipes its content blocks
// without firing the reindexer for the page itself, leaving a stale search doc.
// Snapshot which of the about-to-be-deleted ids are pages BEFORE the delete,
// then drop their docs AFTER the rows are gone.
export const deletePagesSearchHook: BlockDeleteHook = {
  beforeDelete: async (blockIds) => {
    if (blockIds.length === 0) return;
    const pages = await db
      .select({ id: _blocks.id })
      .from(_blocks)
      .where(and(inArray(_blocks.id, blockIds), eq(_blocks.type, PAGE_BLOCK_TYPE)));
    const pageIds = pages.map((p) => p.id);
    if (pageIds.length === 0) return;
    return async () => {
      await deleteSearchDocs("pages", pageIds);
    };
  },
};
