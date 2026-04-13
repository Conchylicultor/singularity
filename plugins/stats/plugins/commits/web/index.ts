import type { PluginDefinition } from "@core";
import { Stats } from "@plugins/stats/web/slots";
import { CumulativeCommitsChart } from "./components/cumulative-chart";
import { CommitsRateChart } from "./components/rate-chart";

const commitsPlugin: PluginDefinition = {
  id: "stats-commits",
  name: "Stats: Commits",
  description: "Commit-based stats: cumulative total and per-period rate.",
  contributions: [
    Stats.Chart({
      id: "commits-cumulative",
      title: "Commits over time",
      component: CumulativeCommitsChart,
    }),
    Stats.Chart({
      id: "commits-rate",
      title: "Commits per period",
      component: CommitsRateChart,
    }),
  ],
};

export default commitsPlugin;
