import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _blocks } from "@plugins/page/plugins/editor/server";
import { imageBlock } from "../../core";
import { imageBlockAttachments } from "./tables";

// Reconcile the block↔attachment link set for an entire document. For each
// image block, mirror its `attachmentId` (or clear it); for every other block,
// clear (a cheap no-op unless it was previously an image). `set()` is an
// idempotent insert-new/delete-removed reconcile.
export async function reconcileDocumentImages(documentId: string): Promise<void> {
  const blocks = await db
    .select({ id: _blocks.id, type: _blocks.type, data: _blocks.data })
    .from(_blocks)
    .where(eq(_blocks.documentId, documentId));
  for (const block of blocks) {
    if (block.type === imageBlock.type) {
      const { attachmentId } = imageBlock.parse(block.data);
      await imageBlockAttachments.set(block.id, attachmentId ? [attachmentId] : []);
    } else {
      await imageBlockAttachments.set(block.id, []);
    }
  }
}
