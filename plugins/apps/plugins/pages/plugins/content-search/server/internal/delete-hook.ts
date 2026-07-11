import { db } from "@plugins/database/server";
import {
  _blocks,
  PAGE_BLOCK_TYPE,
  type BlockDeleteHook,
  type BlockTrashHook,
  type BlockRestoreHook,
} from "@plugins/page/plugins/editor/server";
import { inArray, and, eq } from "drizzle-orm";
import { deleteSearchDocs } from "@plugins/search/plugins/engine/server";
import { reindexPageSearch } from "./reindex-page";

// Which of a set of block ids are `type="page"` rows. Read BEFORE / regardless of
// the delete flag — trashed rows still exist, so the query finds them either way.
async function pageIdsAmong(blockIds: string[]): Promise<string[]> {
  if (blockIds.length === 0) return [];
  const pages = await db
    .select({ id: _blocks.id })
    .from(_blocks)
    .where(and(inArray(_blocks.id, blockIds), eq(_blocks.type, PAGE_BLOCK_TYPE)));
  return pages.map((p) => p.id);
}

// Purge / hard delete: a page's blocks FK-cascade-wipe without firing the
// reindexer for the page itself. Drop its stale search doc AFTER the rows vanish.
// Stays on BeforeDelete so a purge (and any page-free hard delete) deindexes.
export const deletePagesSearchHook: BlockDeleteHook = {
  beforeDelete: async (blockIds) => {
    const pageIds = await pageIdsAmong(blockIds);
    if (pageIds.length === 0) return;
    return async () => {
      await deleteSearchDocs("pages", pageIds);
    };
  },
};

// Trash (soft delete): the rows still exist but must vanish from search. The
// single-delete path never emits `blocksChanged` for the trashed page's own id,
// so this synchronous deindex is what keeps a trashed page out of search results.
export const trashPagesSearchHook: BlockTrashHook = {
  onTrash: async (blockIds) => {
    const pageIds = await pageIdsAmong(blockIds);
    if (pageIds.length > 0) await deleteSearchDocs("pages", pageIds);
  },
};

// Restore: re-derive each restored page's search doc from its (survived) content.
export const restorePagesSearchHook: BlockRestoreHook = {
  onRestore: async (blockIds) => {
    const pageIds = await pageIdsAmong(blockIds);
    for (const pageId of pageIds) await reindexPageSearch(pageId);
  },
};
