import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import { blocksChanged } from "./tables-events";

// Announce a change to a single block. Emits `blocksChanged` so subscribers
// (links / image reindexers) refresh that page. The `page_blocks` content +
// sidebar live resources are invalidated automatically by the L4 DB change-feed
// on the underlying write, so this helper only fans out the cross-plugin event.
// Pass the block's `type` so the caller doesn't re-query.
export async function notifyBlockChange(args: {
  pageId: string | null;
  type: string;
  blockId?: string;
}): Promise<void> {
  if (args.type === PAGE_BLOCK_TYPE) {
    // A page block's own attachments (its cover) are scoped to the page block
    // itself, not its `page_id` (which points at the parent, and is null for
    // root pages). Emit for its own id so the attachment reconcile links the
    // cover.
    if (args.blockId != null) await blocksChanged.emit({ pageId: args.blockId });
  }
  if (args.pageId !== null) {
    await blocksChanged.emit({ pageId: args.pageId });
  }
}
