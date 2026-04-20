import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { handleCumulative } from "./internal/handle-cumulative";

export default {
  id: "stats-tasks",
  name: "Stats: Tasks",
  httpRoutes: {
    "GET /api/stats/tasks/cumulative": handleCumulative,
  },
} satisfies ServerPluginDefinition;
