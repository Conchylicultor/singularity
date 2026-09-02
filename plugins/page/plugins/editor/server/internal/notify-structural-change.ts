import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import { blocksChanged } from "./tables-events";

/**
 * Shared post-commit event fan-out for a structural edit to a page's content
 * (the `applyBlockOp` and `patch` handlers both call this). It:
 *
 *   1. emits `blocksChanged` for the edited page so the link/image reindexers
 *      refresh; and
 *   2. for any `type="page"` block in the deleted set, emits its `blocksChanged`.
 *
 * The `page_blocks` content + sidebar live resources are invalidated
 * automatically by the L4 DB change-feed on the underlying write, so this helper
 * only fans out the cross-plugin event. Factored out of the per-handler bodies
 * so the two structural endpoints share one trigger path.
 */
export async function notifyStructuralChange(args: {
  pageId: string;
  /**
   * Rows removed from the page's live content by this edit (hard-deleted OR
   * trashed), to fan out one `blocksChanged` per emptied sub-page. Only `id` and
   * `type` are read.
   */
  deletedRows: { id: string; type: string }[];
}): Promise<void> {
  // Deliberately NOT `notifyBlockChange`: its extra page-block branch needs a
  // `blockId` (a page block's cover attachments are scoped to the page block's
  // own id, not its `page_id`), and a structural edit has no single block to
  // name. If that emit is ever wanted here, pass a `blockId` — do not go back to
  // deriving a `type` from the edited blocks, which selected the branch without
  // supplying what it needs and so did nothing at all.
  await blocksChanged.emit({ pageId: args.pageId });

  const deletedPages = args.deletedRows.filter(
    (r) => r.type === PAGE_BLOCK_TYPE,
  );
  for (const p of deletedPages) {
    await blocksChanged.emit({ pageId: p.id });
  }
}
