import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteBlock } from "../../core/endpoints";
import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { pagesLiveResource, blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";
import { BlockLifecycle } from "./document-hooks";
import { collectBlockSubtree } from "./collect-subtree";

export const handleDeleteBlock = implement(deleteBlock, async ({ params }) => {
  const [target] = await db
    .select({ id: _blocks.id, pageId: _blocks.pageId, type: _blocks.type })
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!target) throw new HttpError(404, "Not found");

  // The FK cascade silently removes the whole subtree (descendants + blocks +
  // page_links edges). Snapshot the subtree and let registered hooks capture any
  // derived state (e.g. backlinks) that depends on those soon-to-vanish rows.
  const subtreeIds = await collectBlockSubtree(params.id);
  // The page ids inside the deleted subtree — their content resources go empty
  // and the sidebar must drop them.
  const deletedPages = subtreeIds.length
    ? await db
        .select({ id: _blocks.id })
        .from(_blocks)
        .where(
          and(
            inArray(_blocks.id, subtreeIds),
            eq(_blocks.type, PAGE_BLOCK_TYPE),
          ),
        )
    : [];

  const afterCallbacks: Array<() => void | Promise<void>> = [];
  for (const hook of BlockLifecycle.BeforeDelete.getContributions()) {
    const after = await hook.beforeDelete(subtreeIds);
    if (after) afterCallbacks.push(after);
  }

  const [row] = await db
    .delete(_blocks)
    .where(eq(_blocks.id, params.id))
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");

  // The deleted block's content list lost a row. Notify its containing page.
  if (target.pageId !== null) {
    blocksLiveResource.notify({ pageId: target.pageId });
    await blocksChanged.emit({ pageId: target.pageId });
  }
  // Any page in the deleted subtree leaves the sidebar; its content resource is
  // now empty. Refresh once for the sidebar and per emptied page.
  if (deletedPages.length > 0) {
    pagesLiveResource.notify();
    for (const p of deletedPages) blocksLiveResource.notify({ pageId: p.id });
  }

  // Hooks re-push state that depended on the cascade-deleted rows (e.g. the
  // backlinks panels of pages the deleted subtree linked to).
  for (const after of afterCallbacks) await after();
});
