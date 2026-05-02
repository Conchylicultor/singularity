import type { PluginDefinition } from "@core";
import { Config } from "@plugins/config/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Stats } from "@plugins/stats/web";
import { costConfig } from "../shared/config";
import { CostKpis } from "./components/cost-kpis";
import { CumulativeCostChart } from "./components/cumulative-cost-chart";
import { DailyCostChart } from "./components/daily-cost-chart";
import { TokenMixChart } from "./components/token-mix-chart";
import { TopConversationsTable } from "./components/top-conversations-table";
import { costConvSidePane } from "./panes";

export { costConvSidePane } from "./panes";

export default {
  id: "stats-cost",
  name: "Stats: Cost & tokens",
  description:
    "Token usage and dollar cost across Claude Code sessions, with per-conversation breakdown.",
  contributions: [
    Pane.Register({ pane: costConvSidePane }),
    Config.Spec(costConfig),
    Stats.Chart({
      id: "cost-summary",
      title: "Cost & tokens — summary",
      component: CostKpis,
    }),
    Stats.Chart({
      id: "cost-daily-by-model",
      title: "Daily cost by model",
      component: DailyCostChart,
    }),
    Stats.Chart({
      id: "cost-cumulative",
      title: "Cumulative cost over time",
      component: CumulativeCostChart,
    }),
    Stats.Chart({
      id: "cost-token-mix",
      title: "Token mix per day",
      component: TokenMixChart,
    }),
    Stats.Chart({
      id: "cost-top-conversations",
      title: "Top conversations by cost",
      component: TopConversationsTable,
    }),
  ],
} satisfies PluginDefinition;
