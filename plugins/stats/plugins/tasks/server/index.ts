import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleCumulative } from "./internal/handle-cumulative";
import { handleDaily } from "./internal/handle-daily";
import { getTasksCumulative, getTasksDaily } from "../shared/endpoints";

export default {
  name: "Stats: Tasks",
  httpRoutes: {
    [getTasksCumulative.route]: handleCumulative,
    [getTasksDaily.route]: handleDaily,
  },
} satisfies ServerPluginDefinition;
