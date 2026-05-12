import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const JobStateSchema = z.enum(["pending", "running", "retrying", "dead"]);
export type JobState = z.infer<typeof JobStateSchema>;

export const JobRowSchema = z.object({
  id: z.string(),
  jobName: z.string(),
  input: z.unknown(),
  state: JobStateSchema,
  attempts: z.number(),
  maxAttempts: z.number(),
  runAt: z.string(),
  lockedAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  queueName: z.string().nullable(),
  priority: z.number(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRow = z.infer<typeof JobRowSchema>;

export const JobsPayloadSchema = z.object({
  rows: z.array(JobRowSchema),
  counts: z.object({
    pending: z.number(),
    running: z.number(),
    retrying: z.number(),
    dead: z.number(),
  }),
});
export type JobsPayload = z.infer<typeof JobsPayloadSchema>;

export const jobsListResource = resourceDescriptor<JobsPayload>(
  "jobs-list",
  JobsPayloadSchema,
  { rows: [], counts: { pending: 0, running: 0, retrying: 0, dead: 0 } },
);
