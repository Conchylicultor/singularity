import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { handleCumulative } from "./internal/handle-cumulative";

const plugin: ServerPluginDefinition = {
  id: "stats-tasks",
  name: "Stats: Tasks",
  httpRoutes: {
    "GET /api/stats/tasks/cumulative": handleCumulative,
  },
};
export default plugin;
