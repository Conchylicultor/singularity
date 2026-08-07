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
import { archiveShrinkKind, unpricedModelKind } from "./internal/cost-report-kinds";
import { costRefreshJob } from "./internal/refresh-job";
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
    "Token usage and dollar cost across Claude Code sessions, priced from our own merge-only LiteLLM table and banked into a permanent year-sharded token archive so deleted transcripts stop rewriting the past.",
  contributions: [
    ConfigV2.Register({ descriptor: costConfig }),
    unpricedModelKind,
    archiveShrinkKind,
  ],
  register: [costUsageWarmup, costRefreshJob],
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
