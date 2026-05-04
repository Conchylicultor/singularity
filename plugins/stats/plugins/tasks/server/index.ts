import type { ServerPluginDefinition } from "@server/types";
import { handleCumulative } from "./internal/handle-cumulative";
import { handleDaily } from "./internal/handle-daily";

export default {
  id: "stats-tasks",
  name: "Stats: Tasks",
  httpRoutes: {
    "GET /api/stats/tasks/cumulative": handleCumulative,
    "GET /api/stats/tasks/daily": handleDaily,
  },
} satisfies ServerPluginDefinition;
