import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { handleCumulative, handleLinesCumulative } from "./internal/handle-cumulative";
import { handleLinesRate, handleRate } from "./internal/handle-rate";
import { commitsConfig } from "../shared/config";
import {
  getCommitsCumulative,
  getCommitsRate,
  getCommitsLinesCumulative,
  getCommitsLinesRate,
} from "../shared/endpoints";

export default {
  description: "Commit-based stats: commits and lines of change over time.",
  contributions: [ConfigV2.Register({ descriptor: commitsConfig })],
  httpRoutes: {
    [getCommitsCumulative.route]: handleCumulative,
    [getCommitsRate.route]: handleRate,
    [getCommitsLinesCumulative.route]: handleLinesCumulative,
    [getCommitsLinesRate.route]: handleLinesRate,
  },
} satisfies ServerPluginDefinition;
