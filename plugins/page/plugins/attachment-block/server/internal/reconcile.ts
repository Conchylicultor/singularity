import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _blocks } from "@plugins/page/plugins/editor/server";
import { collectBlockAttachmentIds } from "../../core";
import { blockAttachments } from "./tables";
import { AttachmentBlock } from "./collectors";

// Reconcile the block↔attachment link set for an entire page. For each block,
// mirror the attachment ids declared by the base convention
// (`collectBlockAttachmentIds` — `data.attachmentId` and/or `data.attachmentIds`)
// unioned with any contributed collectors (e.g. a page's nested cover image),
// and clear the rest. `set()` is an idempotent insert-new/delete-removed
// reconcile, so this is safe to retry.
//
// The scan covers the page's content blocks (`page_id = pageId`) AND the page
// block itself (`id = pageId`): a page block carries its own attachments (its
// cover) but its `page_id` points at the parent (null for root pages), so the
// `id = pageId` arm is what links a page's own cover.
export async function reconcilePageAttachments(pageId: string): Promise<void> {
  const collectors = AttachmentBlock.Collector.getContributions();
  const blocks = await db
    .select({ id: _blocks.id, data: _blocks.data })
    .from(_blocks)
    .where(
      and(
        or(eq(_blocks.id, pageId), eq(_blocks.pageId, pageId)),
        isNull(_blocks.deletedAt),
      ),
    );
  for (const block of blocks) {
    const ids = new Set(collectBlockAttachmentIds(block.data));
    for (const c of collectors) for (const id of c.collect(block.data)) ids.add(id);
    await blockAttachments.set(block.id, [...ids]);
  }
}
