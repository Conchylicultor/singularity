import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reconcileDocumentImages } from "./reconcile";

// Event-driven reconcile. Bound to the editor's `page.blocksChanged` trigger —
// the per-emit `documentId` arrives through the `event` payload. `dedup: "none"`:
// graphile may retry, but `reconcileDocumentImages` is idempotent (set()-based).
export const reconcileImageAttachmentsJob = defineJob({
  name: "page.image.reconcile",
  input: z.object({}).default({}),
  event: z.object({ documentId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await reconcileDocumentImages(event.documentId);
  },
});
