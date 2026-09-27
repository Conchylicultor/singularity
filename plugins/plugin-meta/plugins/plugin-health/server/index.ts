import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { pluginHealthReviewsServed } from "./internal/resource";
import { proposeTaskTool } from "./internal/mcp-tools";
import {
  handleGetReviews,
  handleGetStaleness,
  handleGetTasksForReview,
} from "./internal/routes";
import {
  getPluginHealthReviews,
  getPluginStaleness,
  getPluginHealthTasks,
} from "../core/endpoints";

export { healthReviewExt } from "./internal/tables";

export default {
  description: "Per-plugin health review tracking.",
  contributions: [...pluginHealthReviewsServed.declare],
  httpRoutes: {
    [getPluginHealthReviews.route]: handleGetReviews,
    [getPluginStaleness.route]: handleGetStaleness,
    [getPluginHealthTasks.route]: handleGetTasksForReview,
  },
  register: [proposeTaskTool],
} satisfies ServerPluginDefinition;
