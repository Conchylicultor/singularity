import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";

// In-memory log for verification; cleared via the reset HTTP route.
// Not persisted — restarts wipe the log.
export interface LogEntry {
  label: string;
  userId: string;
  message: string;
  jobId: string;
  firedAt: string;
}

export const logEntries: LogEntry[] = [];

// Graphile retries on handler throw, so `run` may be invoked more than once
// per jobId. Idempotency is the job author's contract — here we dedup on
// ctx.jobId, which is stable across retries but distinct across separate
// emits/enqueues. See docs/events.md §"Delivery semantics".
const seenRuns = new Set<string>();

export function resetLog(): void {
  logEntries.length = 0;
  seenRuns.clear();
}

// `input` carries the subscriber's `with` fields (label); `event` carries
// the pinged event payload (userId, message). Direct `.enqueue()` bypasses
// the event path entirely and passes `event: undefined` — the handler
// defaults the event-derived fields so direct invocations still log.
export const logPing = defineJob({
  name: "events_test.log",
  input: z.object({ label: z.string() }),
  event: z.object({ userId: z.string(), message: z.string() }),
  dedup: "none",
  run: ({ input: { label }, event, ctx }) => {
    if (seenRuns.has(ctx.jobId)) return;
    seenRuns.add(ctx.jobId);
    logEntries.push({
      label,
      userId: event?.userId ?? "direct",
      message: event?.message ?? "direct-enqueued",
      jobId: ctx.jobId,
      firedAt: new Date().toISOString(),
    });
  },
});
