import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { costConfig } from "../shared/config";
import {
  handleAvgPerConversation,
  handleCumulative,
  handleDaily,
  handleDailyByFamily,
  handleDistribution,
  handleSessions,
  handleTokenMix,
  handleTotals,
} from "./internal/handlers";
import { prewarmBundle } from "./internal/load-usage";
import {
  getCostDaily,
  getCostDailyByFamily,
  getCostCumulative,
  getCostTokenMix,
  getCostTotals,
  getCostSessions,
  getCostDistribution,
  getCostAvgPerConversation,
} from "../shared/endpoints";

export default {
  id: "stats-cost",
  name: "Stats: Cost & tokens",
  description:
    "Token usage and dollar cost across Claude Code sessions, sourced from ccusage.",
  contributions: [Config.Field(costConfig)],
  httpRoutes: {
    [getCostDaily.route]: handleDaily,
    [getCostDailyByFamily.route]: handleDailyByFamily,
    [getCostCumulative.route]: handleCumulative,
    [getCostTokenMix.route]: handleTokenMix,
    [getCostTotals.route]: handleTotals,
    [getCostSessions.route]: handleSessions,
    [getCostDistribution.route]: handleDistribution,
    [getCostAvgPerConversation.route]: handleAvgPerConversation,
  },
  onReady: () => {
    // Walk ~/.claude/projects in the background so the first chart fetch hits
    // a warm cache instead of waiting on ~1k JSONL reads.
    prewarmBundle();
  },
} satisfies ServerPluginDefinition;
