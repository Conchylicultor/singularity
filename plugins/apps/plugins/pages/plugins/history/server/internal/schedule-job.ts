import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { pageSnapshotJob } from "./snapshot-job";

/** Debounce window after the last edit before a snapshot is taken. */
const DEBOUNCE_MS = 4000;

/**
 * Event-bound scheduler for the debounced snapshot. The events dispatcher can't
 * pass `runAt`, so this thin job re-enqueues the keyed {@link pageSnapshotJob}
 * with a fresh `runAt = now + 4s` on every `blocksChanged`. Because the snapshot
 * job is keyed by `pageId`, graphile replaces the pending row — so an edit burst
 * collapses to a single snapshot run ~4s after the last edit. `dedup: "none"`:
 * each event independently re-arms the timer.
 *
 * `Date.now()` is correct here — this is an ordinary job runtime, not a workflow
 * script (the no-reactive-server-io lint rule only targets client `useEffect`s).
 */
export const pageHistoryScheduleJob = defineJob({
  name: "pages.history.schedule",
  input: z.object({}).default({}),
  event: z.object({ pageId: z.string() }),
  dedup: "none",
  run: async ({ event }) => {
    if (!event) return;
    await pageSnapshotJob.enqueue(
      { pageId: event.pageId },
      { runAt: new Date(Date.now() + DEBOUNCE_MS) },
    );
  },
});
