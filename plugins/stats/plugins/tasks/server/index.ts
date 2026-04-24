import type { ServerPluginDefinition } from "@server/types";
import { handleCumulative } from "./internal/handle-cumulative";

export default {
  id: "stats-tasks",
  name: "Stats: Tasks",
  httpRoutes: {
    "GET /api/stats/tasks/cumulative": handleCumulative,
  },
} satisfies ServerPluginDefinition;
