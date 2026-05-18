import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getPluginHealthReviews = defineEndpoint({
  route: "GET /api/plugin-health/reviews",
});

export const getPluginStaleness = defineEndpoint({
  route: "GET /api/plugin-health/staleness/:pluginId",
});

export const getPluginHealthTasks = defineEndpoint({
  route: "GET /api/plugin-health/tasks/:reviewId",
});
