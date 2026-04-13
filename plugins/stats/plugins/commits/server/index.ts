import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { handleCumulative } from "./internal/handle-cumulative";
import { handleRate } from "./internal/handle-rate";

const plugin: ServerPluginDefinition = {
  id: "stats-commits",
  name: "Stats: Commits",
  httpRoutes: {
    "GET /api/stats/commits/cumulative": handleCumulative,
    "GET /api/stats/commits/rate": handleRate,
  },
};
export default plugin;
