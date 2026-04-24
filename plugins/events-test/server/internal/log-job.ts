import { z } from "zod";
import { defineJob } from "@plugins/jobs/server";

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
// jobId (the Graphile job id), which is stable across retries but distinct
// across separate emits/enqueues. See docs/events.md §"Delivery semantics".
const seenRuns = new Set<string>();

export function resetLog(): void {
  logEntries.length = 0;
  seenRuns.clear();
}

// Single input schema that holds both the trigger's static `with` fields
// (label) and the event payload (userId, message). Via the events dispatcher,
// jobWith and eventPayload are merged before this schema parses them;
// `logPing.enqueue({...})` bypasses the event path entirely.
export const logPing = defineJob({
  name: "events_test.log",
  input: z.object({
    label: z.string(),
    userId: z.string(),
    message: z.string(),
  }),
  run: ({ label, userId, message }, ctx) => {
    if (seenRuns.has(ctx.jobId)) return;
    seenRuns.add(ctx.jobId);
    logEntries.push({
      label,
      userId,
      message,
      jobId: ctx.jobId,
      firedAt: new Date().toISOString(),
    });
  },
});
