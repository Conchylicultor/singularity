import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _blocks, PAGE_BLOCK_TYPE, type BlockDeleteHook } from "@plugins/page/plugins/editor/server";
import { deleteVersions } from "@plugins/history/plugins/engine/server";

// Deleting a page (a `type="page"` block) FK-cascade-wipes its content blocks
// without surfacing the page itself, leaving orphaned version rows. Snapshot
// which of the about-to-be-deleted ids are pages BEFORE the delete, then drop
// their version history AFTER the rows are gone. Mirrors the search consumer's
// delete hook; decision: drop history on page delete (no orphans).
export const deletePageHistoryHook: BlockDeleteHook = {
  beforeDelete: async (blockIds) => {
    if (blockIds.length === 0) return;
    const pages = await db
      .select({ id: _blocks.id })
      .from(_blocks)
      .where(and(inArray(_blocks.id, blockIds), eq(_blocks.type, PAGE_BLOCK_TYPE)));
    const pageIds = pages.map((p) => p.id);
    if (pageIds.length === 0) return;
    return async () => {
      await deleteVersions("pages", pageIds);
    };
  },
};
