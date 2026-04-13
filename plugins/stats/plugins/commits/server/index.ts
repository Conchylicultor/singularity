import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { handleCumulative, handleLinesCumulative } from "./internal/handle-cumulative";
import { handleLinesRate, handleRate } from "./internal/handle-rate";

const plugin: ServerPluginDefinition = {
  id: "stats-commits",
  name: "Stats: Commits",
  httpRoutes: {
    "GET /api/stats/commits/cumulative": handleCumulative,
    "GET /api/stats/commits/rate": handleRate,
    "GET /api/stats/commits/lines/cumulative": handleLinesCumulative,
    "GET /api/stats/commits/lines/rate": handleLinesRate,
  },
};
export default plugin;
