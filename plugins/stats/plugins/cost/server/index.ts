import type { ServerPluginDefinition } from "@server/types";
import { costConfig } from "../shared/config";
import {
  handleCumulative,
  handleDaily,
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
  config: costConfig,
  httpRoutes: {
    "GET /api/stats/cost/daily": handleDaily,
    "GET /api/stats/cost/cumulative": handleCumulative,
    "GET /api/stats/cost/token-mix": handleTokenMix,
    "GET /api/stats/cost/totals": handleTotals,
    "GET /api/stats/cost/sessions": handleSessions,
  },
  onReady: () => {
    // Walk ~/.claude/projects in the background so the first chart fetch hits
    // a warm cache instead of waiting on ~1k JSONL reads.
    prewarmBundle();
  },
} satisfies ServerPluginDefinition;
