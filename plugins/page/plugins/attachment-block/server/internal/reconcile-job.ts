import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reconcilePageAttachments } from "./reconcile";

// Event-driven reconcile. Bound to the editor's `page.blocksChanged` trigger —
// the per-emit `pageId` arrives through the `event` payload. `dedup: "none"`:
// graphile may retry, but `reconcilePageAttachments` is idempotent (set()-based).
export const reconcileBlockAttachmentsJob = defineJob({
  name: "page.attachment-block.reconcile",
  input: z.object({}).default({}),
  event: z.object({ pageId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await reconcilePageAttachments(event.pageId);
  },
});
