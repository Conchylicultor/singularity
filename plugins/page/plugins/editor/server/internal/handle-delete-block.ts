import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteBlock } from "../../core/endpoints";
import { _blocks } from "./tables";
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

  // The deleted block's content list lost a row. Fan out to reindex subscribers
  // for its containing page; the page_blocks live resources invalidate via the
  // L4 DB change-feed on the cascade DELETE.
  if (target.pageId !== null) {
    await blocksChanged.emit({ pageId: target.pageId });
  }

  // Hooks re-push state that depended on the cascade-deleted rows (e.g. the
  // backlinks panels of pages the deleted subtree linked to).
  for (const after of afterCallbacks) await after();
});
