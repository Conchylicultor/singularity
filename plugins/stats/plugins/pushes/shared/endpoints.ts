import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getPushesWaitTime = defineEndpoint({
  route: "GET /api/stats/pushes/wait-time",
});

export const getPushesThroughput = defineEndpoint({
  route: "GET /api/stats/pushes/throughput",
});

export const getPushesStepBreakdown = defineEndpoint({
  route: "GET /api/stats/pushes/step-breakdown",
});
