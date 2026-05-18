import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const listJobs = defineEndpoint({
  route: "GET /api/jobs",
});

export const retryJob = defineEndpoint({
  route: "POST /api/jobs/:id/retry",
});

export const cancelJob = defineEndpoint({
  route: "DELETE /api/jobs/:id",
});
