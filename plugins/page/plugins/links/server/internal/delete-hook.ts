import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  _blocks,
  PAGE_BLOCK_TYPE,
  type BlockDeleteHook,
  type BlockTrashHook,
  type BlockRestoreHook,
} from "@plugins/page/plugins/editor/server";
import { _pageLinks } from "./tables";
import { reindexPage } from "./reindex";

// The `type="page"` ids among a set of block ids (trashed rows still exist, so
// this finds them either way).
async function pageIdsAmong(blockIds: string[]): Promise<string[]> {
  if (blockIds.length === 0) return [];
  const pages = await db
    .select({ id: _blocks.id })
    .from(_blocks)
    .where(and(inArray(_blocks.id, blockIds), eq(_blocks.type, PAGE_BLOCK_TYPE)));
  return pages.map((p) => p.id);
}

// HARD delete / purge: the FK cascade wipes a deleted subtree's `page_links`
// edges, and the L4 change-feed fans out to every dependent backlinksResource. No
// hand-snapshot / re-push needed.
export const backlinksDeleteHook: BlockDeleteHook = {
  beforeDelete: () => undefined,
};

// TRASH (soft delete): the cascade never fired, so a trashed page's OUTGOING
// edges linger — every page it linked to would still show it as a backlink.
// Delete those edges; the change-feed refreshes the affected targets' panels.
// (Incoming edges self-heal: the target validation excludes trashed pages, so a
// source page drops its link on its next reindex.)
export const backlinksTrashHook: BlockTrashHook = {
  onTrash: async (blockIds) => {
    const pageIds = await pageIdsAmong(blockIds);
    if (pageIds.length === 0) return;
    await db.delete(_pageLinks).where(inArray(_pageLinks.sourcePageId, pageIds));
  },
};

// Restore: rebuild each restored page's outgoing edges from its (survived)
// content.
export const backlinksRestoreHook: BlockRestoreHook = {
  onRestore: async (blockIds) => {
    const pageIds = await pageIdsAmong(blockIds);
    for (const pageId of pageIds) await reindexPage(pageId);
  },
};
