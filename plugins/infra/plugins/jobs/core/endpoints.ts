import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { JobsPayloadSchema } from "./resources";

export const listJobs = defineEndpoint({
  route: "GET /api/jobs",
  response: JobsPayloadSchema,
});

export const retryJob = defineEndpoint({
  route: "POST /api/jobs/:id/retry",
});

export const cancelJob = defineEndpoint({
  route: "DELETE /api/jobs/:id",
});
