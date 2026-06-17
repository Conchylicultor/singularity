import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import type { BlockRow } from "./forest";
import { notifyBlockChange } from "./notify";
import { pagesLiveResource, blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";

/**
 * Shared post-commit notification for a structural edit to a page's content
 * (the `applyBlockOp` and `patch` handlers both call this). It:
 *
 *   1. notifies the page's content resource + emits `blocksChanged` (via
 *      `notifyBlockChange`) so the open editor and link/image reindexers refresh,
 *      with a `type` derived from the primary edited block so a page edit also
 *      refreshes the sidebar; and
 *   2. for any `type="page"` block in the deleted set, refreshes the sidebar and
 *      that page's (now-empty) content resource + emits its `blocksChanged`.
 *
 * Factored out of the per-handler bodies so the two structural endpoints share
 * one notify/trigger path rather than each re-deriving it.
 */
export async function notifyStructuralChange(args: {
  pageId: string;
  /** The primary edited block's type, used to refresh the sidebar on a page edit. */
  primaryType: string;
  /** Rows that were deleted by this edit (to fan out per emptied sub-page). */
  deletedRows: BlockRow[];
}): Promise<void> {
  await notifyBlockChange({ pageId: args.pageId, type: args.primaryType });

  const deletedPages = args.deletedRows.filter((r) => r.type === PAGE_BLOCK_TYPE);
  if (deletedPages.length > 0) {
    pagesLiveResource.notify();
    for (const p of deletedPages) {
      blocksLiveResource.notify({ pageId: p.id });
      await blocksChanged.emit({ pageId: p.id });
    }
  }
}
