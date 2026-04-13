import type { PluginDefinition } from "@core";
import { Stats } from "@plugins/stats/web/slots";
import { CumulativeCommitsChart } from "./components/cumulative-chart";
import { CumulativeLinesChart, LinesRateChart } from "./components/lines-charts";
import { CommitsRateChart } from "./components/rate-chart";

const commitsPlugin: PluginDefinition = {
  id: "stats-commits",
  name: "Stats: Commits",
  description: "Commit-based stats: commits and lines of change over time.",
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
    Stats.Chart({
      id: "lines-cumulative",
      title: "Lines changed over time",
      component: CumulativeLinesChart,
    }),
    Stats.Chart({
      id: "lines-rate",
      title: "Lines changed per period",
      component: LinesRateChart,
    }),
  ],
};

export default commitsPlugin;
