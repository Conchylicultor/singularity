import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { handleCumulative, handleLinesCumulative } from "./internal/handle-cumulative";
import { handleLinesRate, handleRate } from "./internal/handle-rate";
import { commitsConfig } from "../shared/config";

const plugin: ServerPluginDefinition = {
  id: "stats-commits",
  name: "Stats: Commits",
  description: "Commit-based stats: commits and lines of change over time.",
  config: commitsConfig,
  httpRoutes: {
    "GET /api/stats/commits/cumulative": handleCumulative,
    "GET /api/stats/commits/rate": handleRate,
    "GET /api/stats/commits/lines/cumulative": handleLinesCumulative,
    "GET /api/stats/commits/lines/rate": handleLinesRate,
  },
};
export default plugin;
