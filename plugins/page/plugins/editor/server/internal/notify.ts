import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import { pagesLiveResource, blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";

// Announce a change to a single block. Notifies the content resource for the
// block's `pageId` (when set) and emits `blocksChanged` so subscribers (links /
// image reindexers) refresh that page. When the block itself is a page
// (`type="page"`), the pages sidebar resource is notified too. Pass the block's
// `type` so the caller doesn't re-query.
export async function notifyBlockChange(args: {
  pageId: string | null;
  type: string;
  blockId?: string;
}): Promise<void> {
  if (args.type === PAGE_BLOCK_TYPE) {
    pagesLiveResource.notify();
    // A page block's own attachments (its cover) are scoped to the page block
    // itself, not its `page_id` (which points at the parent, and is null for
    // root pages). Emit for its own id so the attachment reconcile links the
    // cover. Additive: the `page_id` scoping below — content resource, sidebar,
    // links reindex — is unchanged.
    if (args.blockId != null) await blocksChanged.emit({ pageId: args.blockId });
  }
  if (args.pageId !== null) {
    blocksLiveResource.notify({ pageId: args.pageId });
    await blocksChanged.emit({ pageId: args.pageId });
  }
}
