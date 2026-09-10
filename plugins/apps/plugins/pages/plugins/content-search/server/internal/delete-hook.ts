import {
  PAGE_BLOCK_TYPE,
  type BlockDeleteHook,
  type BlockTrashHook,
  type BlockRestoreHook,
  type DeletedBlockRow,
} from "@plugins/page/plugins/editor/server";
import { deleteSearchDocs } from "@plugins/search/plugins/engine/server";
import { reindexPageSearch } from "./reindex-page";

// Which of the handed rows are `type="page"` rows. Every hook is handed ROWS,
// so this is answered in memory — no DB round-trip, nothing held while a page
// lock is up. Trashed rows still exist, but nothing here needs to read them.
const pageIdsAmong = (rows: readonly DeletedBlockRow[]): string[] =>
  rows.filter((r) => r.type === PAGE_BLOCK_TYPE).map((r) => r.id);

// Purge / hard delete: a page's blocks FK-cascade-wipe without firing the
// reindexer for the page itself. Drop its stale search doc AFTER the rows vanish.
// The deindex itself is heavy re-derivation, so it rides the after-commit
// callback.
export const deletePagesSearchHook: BlockDeleteHook = {
  onDelete: (rows) => {
    const pageIds = pageIdsAmong(rows);
    if (pageIds.length === 0) return;
    return async () => {
      await deleteSearchDocs("pages", pageIds);
    };
  },
};

// Trash (soft delete): the rows still exist but must vanish from search. The
// single-delete path never emits `blocksChanged` for the trashed page's own id,
// so this synchronous deindex is what keeps a trashed page out of search results.
// A trashed CONTENT row (every block delete is a trash) needs nothing here: its
// page's `blocksChanged` re-derives that page's search doc over live rows only.
export const trashPagesSearchHook: BlockTrashHook = {
  onTrash: async (rows) => {
    const pageIds = pageIdsAmong(rows);
    if (pageIds.length > 0) await deleteSearchDocs("pages", pageIds);
  },
};

// Restore: re-derive each restored page's search doc from its (survived) content.
export const restorePagesSearchHook: BlockRestoreHook = {
  onRestore: async (rows) => {
    for (const pageId of pageIdsAmong(rows)) await reindexPageSearch(pageId);
  },
};
