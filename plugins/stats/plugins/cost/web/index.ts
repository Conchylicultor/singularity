import type { PluginDefinition } from "@core";
import { Config } from "@plugins/config/web";
import { Stats } from "@plugins/stats/web";
import { costConfig } from "../shared/config";
import { AvgCostPerConversationChart } from "./components/avg-cost-per-conversation-chart";
import { CostDistributionChart } from "./components/cost-distribution-chart";
import { CostSection } from "./components/cost-section";
import { TokenMixChart } from "./components/token-mix-chart";
import { TopConversationsTable } from "./components/top-conversations-table";

export default {
  id: "stats-cost",
  name: "Stats: Cost & tokens",
  description:
    "Token usage and dollar cost across Claude Code sessions, with per-conversation breakdown.",
  contributions: [
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
      id: "cost-avg-per-conversation",
      title: "Average cost per conversation",
      component: AvgCostPerConversationChart,
    }),
    Stats.Chart({
      id: "cost-distribution",
      title: "Cost distribution per conversation",
      component: CostDistributionChart,
    }),
    Stats.Chart({
      id: "cost-top-conversations",
      title: "Top conversations by cost",
      component: TopConversationsTable,
    }),
  ],
} satisfies PluginDefinition;
