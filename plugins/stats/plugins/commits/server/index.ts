import type { ServerPluginDefinition } from "@server/types";
import { handleCumulative, handleLinesCumulative } from "./internal/handle-cumulative";
import { handleLinesRate, handleRate } from "./internal/handle-rate";
import {
  excludedPathStateResource,
  handleDeleteState,
  handleGetState,
  handlePatchState,
} from "./internal/excluded-paths";
import { commitsConfig } from "../shared/config";

export default {
  id: "stats-commits",
  name: "Stats: Commits",
  description: "Commit-based stats: commits and lines of change over time.",
  config: commitsConfig,
  httpRoutes: {
    "GET /api/stats/commits/cumulative": handleCumulative,
    "GET /api/stats/commits/rate": handleRate,
    "GET /api/stats/commits/lines/cumulative": handleLinesCumulative,
    "GET /api/stats/commits/lines/rate": handleLinesRate,
    "GET /api/stats/commits/excluded-path-state": handleGetState,
    "PATCH /api/stats/commits/excluded-path-state": handlePatchState,
    "DELETE /api/stats/commits/excluded-path-state/:path": handleDeleteState,
  },
  resources: [excludedPathStateResource],
} satisfies ServerPluginDefinition;
