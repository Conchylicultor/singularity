import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { DeadJobsPayloadSchema, JobsPayloadSchema } from "./resources";

export const listJobs = defineEndpoint({
  route: "GET /api/jobs",
  response: JobsPayloadSchema,
});

export const listDeadJobs = defineEndpoint({
  route: "GET /api/jobs/dead",
  response: DeadJobsPayloadSchema,
});

export const retryJob = defineEndpoint({
  route: "POST /api/jobs/:id/retry",
});

export const cancelJob = defineEndpoint({
  route: "DELETE /api/jobs/:id",
});
