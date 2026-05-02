import type { PluginDefinition } from "@core";
import { Config } from "@plugins/config/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Stats } from "@plugins/stats/web";
import { costConfig } from "../shared/config";
import { CostDistributionChart } from "./components/cost-distribution-chart";
import { CostSection } from "./components/cost-section";
import { ModelUsageChart } from "./components/model-usage-chart";
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
      id: "cost-overview",
      title: "Cost & Tokens",
      component: CostSection,
    }),
    Stats.Chart({
      id: "cost-token-mix",
      title: "Token mix per day",
      component: TokenMixChart,
    }),
    Stats.Chart({
      id: "cost-distribution",
      title: "Cost distribution per conversation",
      component: CostDistributionChart,
    }),
    Stats.Chart({
      id: "cost-model-usage",
      title: "Sessions per day by model family",
      component: ModelUsageChart,
    }),
    Stats.Chart({
      id: "cost-top-conversations",
      title: "Top conversations by cost",
      component: TopConversationsTable,
    }),
  ],
} satisfies PluginDefinition;
