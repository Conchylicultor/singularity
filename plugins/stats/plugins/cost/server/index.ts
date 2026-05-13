import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { costConfig } from "@plugins/stats/plugins/cost/shared/config";
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

export default {
  id: "stats-cost",
  name: "Stats: Cost & tokens",
  description:
    "Token usage and dollar cost across Claude Code sessions, sourced from ccusage.",
  contributions: [Config.Field(costConfig)],
  httpRoutes: {
    "GET /api/stats/cost/daily": handleDaily,
    "GET /api/stats/cost/daily-by-family": handleDailyByFamily,
    "GET /api/stats/cost/cumulative": handleCumulative,
    "GET /api/stats/cost/token-mix": handleTokenMix,
    "GET /api/stats/cost/totals": handleTotals,
    "GET /api/stats/cost/sessions": handleSessions,
    "GET /api/stats/cost/distribution": handleDistribution,
    "GET /api/stats/cost/avg-per-conversation": handleAvgPerConversation,
  },
  onReady: () => {
    // Walk ~/.claude/projects in the background so the first chart fetch hits
    // a warm cache instead of waiting on ~1k JSONL reads.
    prewarmBundle();
  },
} satisfies ServerPluginDefinition;
