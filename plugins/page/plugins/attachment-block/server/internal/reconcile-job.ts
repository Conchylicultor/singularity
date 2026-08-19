import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reconcilePageAttachments } from "./reconcile";

// Event-driven reconcile. Bound to the editor's `page.blocksChanged` trigger —
// the per-emit `pageId` arrives through the `event` payload. `dedup: "none"`:
// graphile may retry, but `reconcilePageAttachments` is idempotent (set()-based).
export const reconcileBlockAttachmentsJob = defineJob({
  name: "page.attachment-block.reconcile",
  // instant, and the measurements disagree ON PURPOSE. `slow_ops` shows a
  // max_ms near 1050s for this job, but that number is wall-clock INCLUDING
  // gate wait: the handler is one indexed SELECT over a page's blocks plus one
  // indexed set() per block — no network, no spawn, no model call. The tail was
  // background-tx-acquire wait plus an un-batched per-block round-trip, i.e. two
  // defects, neither of which a bigger hold class would fix. Conformance is read
  // off WORK time (durationMs - waitMs) precisely so this stays honest; if the
  // work itself ever exceeds 10s, queue-slot-hog names the unbatched loop.
  // See research/2026-08-19-global-job-hold-class-reserved-slots.md §6.
  hold: "instant",
  input: z.object({}).default({}),
  event: z.object({ pageId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await reconcilePageAttachments(event.pageId);
  },
});
