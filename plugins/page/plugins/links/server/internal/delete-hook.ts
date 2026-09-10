import { inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  PAGE_BLOCK_TYPE,
  type BlockDeleteHook,
  type BlockTrashHook,
  type BlockRestoreHook,
  type DeletedBlockRow,
} from "@plugins/page/plugins/editor/server";
import { _pageLinks } from "./tables";
import { reindexPage } from "./reindex";

// The `type="page"` ids among the handed rows — answered in memory, since every
// hook is handed ROWS (trashed rows still exist, but nothing here reads them).
const pageIdsAmong = (rows: readonly DeletedBlockRow[]): string[] =>
  rows.filter((r) => r.type === PAGE_BLOCK_TYPE).map((r) => r.id);

// HARD delete / purge: the FK cascade wipes a deleted subtree's `page_links`
// edges, and the L4 change-feed fans out to every dependent backlinksResource. No
// hand-snapshot / re-push needed.
export const backlinksDeleteHook: BlockDeleteHook = {
  onDelete: () => undefined,
};

// TRASH (soft delete): the cascade never fired, so a trashed page's OUTGOING
// edges linger — every page it linked to would still show it as a backlink.
// Delete those edges; the change-feed refreshes the affected targets' panels.
// (Incoming edges self-heal: the target validation excludes trashed pages, so a
// source page drops its link on its next reindex. A trashed CONTENT row's own
// links drop the same way — its page's `blocksChanged` reindex reads live rows
// only.)
export const backlinksTrashHook: BlockTrashHook = {
  onTrash: async (rows) => {
    const pageIds = pageIdsAmong(rows);
    if (pageIds.length === 0) return;
    await db
      .delete(_pageLinks)
      .where(inArray(_pageLinks.sourcePageId, pageIds));
  },
};

// Restore: rebuild each restored page's outgoing edges from its (survived)
// content.
export const backlinksRestoreHook: BlockRestoreHook = {
  onRestore: async (rows) => {
    for (const pageId of pageIdsAmong(rows)) await reindexPage(pageId);
  },
};
