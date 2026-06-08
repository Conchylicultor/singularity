import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { PluginStalenessSchema, ReviewTaskSummarySchema } from "./schemas";

export const getPluginHealthReviews = defineEndpoint({
  route: "GET /api/plugin-health/reviews",
});

export const getPluginStaleness = defineEndpoint({
  route: "GET /api/plugin-health/staleness/:pluginId",
  response: z.array(PluginStalenessSchema),
});

export const getPluginHealthTasks = defineEndpoint({
  route: "GET /api/plugin-health/tasks/:reviewId",
  response: z.array(ReviewTaskSummarySchema),
});
