import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reconcilePageImages } from "./reconcile";

// Event-driven reconcile. Bound to the editor's `page.blocksChanged` trigger —
// the per-emit `pageId` arrives through the `event` payload. `dedup: "none"`:
// graphile may retry, but `reconcilePageImages` is idempotent (set()-based).
export const reconcileImageAttachmentsJob = defineJob({
  name: "page.image.reconcile",
  input: z.object({}).default({}),
  event: z.object({ pageId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await reconcilePageImages(event.pageId);
  },
});
