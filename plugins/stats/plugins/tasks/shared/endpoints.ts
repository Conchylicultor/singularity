import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTasksCumulative = defineEndpoint({
  route: "GET /api/stats/tasks/cumulative",
});

export const getTasksDaily = defineEndpoint({
  route: "GET /api/stats/tasks/daily",
});
