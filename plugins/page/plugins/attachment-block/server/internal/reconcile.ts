import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _blocks } from "@plugins/page/plugins/editor/server";
import { collectBlockAttachmentIds } from "../../core";
import { blockAttachments } from "./tables";

// Reconcile the block↔attachment link set for an entire page. For each block,
// mirror the attachment ids declared by the shared convention
// (`collectBlockAttachmentIds`) — `data.attachmentId` and/or `data.attachmentIds`
// — and clear the rest. `set()` is an idempotent insert-new/delete-removed
// reconcile, so this is safe to retry.
export async function reconcilePageAttachments(pageId: string): Promise<void> {
  const blocks = await db
    .select({ id: _blocks.id, data: _blocks.data })
    .from(_blocks)
    .where(eq(_blocks.pageId, pageId));
  for (const block of blocks) {
    await blockAttachments.set(block.id, collectBlockAttachmentIds(block.data));
  }
}
