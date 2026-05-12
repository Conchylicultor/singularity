import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { pluginHealthReviewsResource } from "./internal/resource";
import { proposeTaskTool } from "./internal/mcp-tools";
import {
  handleGetReviews,
  handleGetStaleness,
  handleGetTasksForReview,
} from "./internal/routes";

export { healthReviewExt } from "./internal/tables";
export { pluginHealthReviewsResource } from "./internal/resource";

export default {
  id: "plugin-health",
  name: "Plugin Health",
  description: "Per-plugin health review tracking.",
  contributions: [Resource.Declare(pluginHealthReviewsResource)],
  httpRoutes: {
    "GET /api/plugin-health/reviews": handleGetReviews,
    "GET /api/plugin-health/staleness/:pluginId": handleGetStaleness,
    "GET /api/plugin-health/tasks/:reviewId": handleGetTasksForReview,
  },
  register: [proposeTaskTool],
} satisfies ServerPluginDefinition;
