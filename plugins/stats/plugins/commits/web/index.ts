import type { PluginDefinition } from "@core";
import { Stats } from "@plugins/stats/web/slots";
import { Config } from "@plugins/config/web/slots";
import { CumulativeCommitsChart } from "./components/cumulative-chart";
import { LinesChartsSection } from "./components/lines-charts";
import { CommitsRateChart } from "./components/rate-chart";
import { commitsConfig } from "../shared/config";

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
      id: "lines",
      title: "Lines changed",
      component: LinesChartsSection,
    }),
    Config.Spec(commitsConfig),
  ],
};

export default commitsPlugin;
