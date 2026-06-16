import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { reconcileReminders } from "./reconcile";

// Event-driven reminder reconcile. Bound to the editor's `page.blocksChanged`
// trigger via `Trigger({ on: blocksChanged, do: reminderReconcileJob, with: {} })`
// — the per-emit `pageId` arrives through the `event` payload. `dedup: "none"`:
// graphile may retry, but `reconcileReminders` is idempotent (diff-based).
export const reminderReconcileJob = defineJob({
  name: "page.reminders.reconcile",
  input: z.object({}).default({}),
  event: z.object({ pageId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await reconcileReminders(event.pageId);
  },
});
