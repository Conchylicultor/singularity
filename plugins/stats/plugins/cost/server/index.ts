import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
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
import { costUsageWarmup } from "./internal/load-usage";
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
  description:
    "Token usage and dollar cost across Claude Code sessions, sourced from ccusage.",
  contributions: [ConfigV2.Register({ descriptor: costConfig })],
  register: [costUsageWarmup],
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
} satisfies ServerPluginDefinition;
