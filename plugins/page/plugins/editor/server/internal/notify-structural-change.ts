import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import { notifyBlockChange } from "./notify";
import { blocksChanged } from "./tables-events";

/**
 * Shared post-commit event fan-out for a structural edit to a page's content
 * (the `applyBlockOp` and `patch` handlers both call this). It:
 *
 *   1. emits `blocksChanged` for the edited page (via `notifyBlockChange`) so the
 *      link/image reindexers refresh, with a `type` derived from the primary
 *      edited block; and
 *   2. for any `type="page"` block in the deleted set, emits its `blocksChanged`.
 *
 * The `page_blocks` content + sidebar live resources are invalidated
 * automatically by the L4 DB change-feed on the underlying write, so this helper
 * only fans out the cross-plugin event. Factored out of the per-handler bodies
 * so the two structural endpoints share one trigger path.
 */
export async function notifyStructuralChange(args: {
  pageId: string;
  /** The primary edited block's type, used by reindex subscribers. */
  primaryType: string;
  /**
   * Rows removed from the page's live content by this edit (hard-deleted OR
   * trashed), to fan out one `blocksChanged` per emptied sub-page. Only `id` and
   * `type` are read.
   */
  deletedRows: { id: string; type: string }[];
}): Promise<void> {
  await notifyBlockChange({ pageId: args.pageId, type: args.primaryType });

  const deletedPages = args.deletedRows.filter((r) => r.type === PAGE_BLOCK_TYPE);
  for (const p of deletedPages) {
    await blocksChanged.emit({ pageId: p.id });
  }
}
