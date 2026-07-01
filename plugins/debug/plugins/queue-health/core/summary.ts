import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// A response schema is required for useEndpoint/fetchEndpoint (and the MCP tool)
// to return parsed data. These three item schemas mirror the jobs plugin's
// introspection return shapes (BacklogJobStat / RunningJobStat / DeadJobStat) —
// the server ignores the schema, so it is client- and MCP-safe.

// Mirrors jobs' BacklogJobStat: ready-queue depth per jobName.
const backlogJobStatSchema = z.object({
  jobName: z.string(),
  readyCount: z.number().int(),
  oldestOverdueMs: z.number().int(),
});

// Mirrors jobs' RunningJobStat: a currently-locked job holding a shared slot.
const runningJobStatSchema = z.object({
  jobName: z.string(),
  jobId: z.string(),
  lockedForMs: z.number().int(),
  lockedBy: z.string().nullable(),
});

// Mirrors jobs' DeadJobStat: terminally-dead rows per jobName.
const deadJobStatSchema = z.object({
  jobName: z.string(),
  deadCount: z.number().int(),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  lastError: z.string().nullable(),
  sampleJobId: z.string().nullable(),
});

// A single attributed snapshot of the queue's health: the shared slot-pool size,
// the aggregate backlog, and the per-jobName breakdowns that attribute backlog
// (byJobName), slot-holding (running), and terminal failures (dead).
export const QueueHealthSummarySchema = z.object({
  concurrency: z.number().int(),
  backlog: z.object({
    readyCount: z.number().int(),
    lockedCount: z.number().int(),
    oldestOverdueMs: z.number().int(),
  }),
  byJobName: z.array(backlogJobStatSchema),
  running: z.array(runningJobStatSchema),
  dead: z.array(deadJobStatSchema),
});
export type QueueHealthSummary = z.infer<typeof QueueHealthSummarySchema>;

export const queueHealthSummaryEndpoint = defineEndpoint({
  route: "GET /api/debug/queue-health/summary",
  response: QueueHealthSummarySchema,
});
