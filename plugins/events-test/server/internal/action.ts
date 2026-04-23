import { z } from "zod";
import { defineAction } from "@plugins/events/server";
import type { PingedPayload } from "./tables";

// In-memory log for verification; cleared via the reset HTTP route.
// Not persisted — restarts wipe the log.
export interface LogEntry {
  label: string;
  payload: PingedPayload;
  triggerId: string;
  firedAt: string;
}

export const actionLog: LogEntry[] = [];

// Graphile retries on handler throw, so `run` may be invoked more than once
// per runId. Idempotency is the action author's contract — here we dedup on
// runId (the Graphile job id), which is stable across retries but distinct
// across separate emits. See docs/events.md §"Delivery semantics".
const seenRuns = new Set<string>();

export function resetActionLog(): void {
  actionLog.length = 0;
  seenRuns.clear();
}

export const logPing = defineAction({
  name: "events_test.log",
  config: z.object({
    label: z.string(),
  }),
  run: ({ label }, ctx) => {
    if (seenRuns.has(ctx.runId)) return;
    seenRuns.add(ctx.runId);
    actionLog.push({
      label,
      payload: ctx.payload as PingedPayload,
      triggerId: ctx.triggerId,
      firedAt: new Date().toISOString(),
    });
  },
});
