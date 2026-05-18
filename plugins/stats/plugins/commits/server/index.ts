import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { handleCumulative, handleLinesCumulative } from "./internal/handle-cumulative";
import { handleLinesRate, handleRate } from "./internal/handle-rate";
import {
  excludedPathStateResource,
  handleDeleteState,
  handleGetState,
  handlePatchState,
} from "./internal/excluded-paths";
import { commitsConfig } from "../shared/config";
import {
  getCommitsCumulative,
  getCommitsRate,
  getCommitsLinesCumulative,
  getCommitsLinesRate,
  getExcludedPathState,
  patchExcludedPathState,
  deleteExcludedPathState,
} from "../shared/endpoints";

export default {
  id: "stats-commits",
  name: "Stats: Commits",
  description: "Commit-based stats: commits and lines of change over time.",
  contributions: [Config.Field(commitsConfig), Resource.Declare(excludedPathStateResource)],
  httpRoutes: {
    [getCommitsCumulative.route]: handleCumulative,
    [getCommitsRate.route]: handleRate,
    [getCommitsLinesCumulative.route]: handleLinesCumulative,
    [getCommitsLinesRate.route]: handleLinesRate,
    [getExcludedPathState.route]: handleGetState,
    [patchExcludedPathState.route]: handlePatchState,
    [deleteExcludedPathState.route]: handleDeleteState,
  },
} satisfies ServerPluginDefinition;
