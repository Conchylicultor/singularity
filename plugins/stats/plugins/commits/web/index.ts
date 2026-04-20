import type { PluginDefinition } from "@core";
import { Stats } from "@plugins/stats/web";
import { Config } from "@plugins/config/web";
import { CumulativeCommitsChart } from "./components/cumulative-chart";
import { ExcludedPathToggles } from "./components/excluded-path-toggles";
import { LinesChartsSection } from "./components/lines-charts";
import { CommitsRateChart } from "./components/rate-chart";
import { commitsConfig } from "../shared/config";

export {
  useFetchJson,
  ChartState,
  axisProps,
  yAxisFormatter,
  tooltipNumberFormatter,
  tooltipContentStyle,
  tooltipLabelStyle,
  lineCursor,
  barCursor,
  gridProps,
} from "./components/chart-primitives";

export default {
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
    Config.Section({
      id: "excluded-path-state",
      title: "Excluded path toggles",
      description:
        "Toggle each excluded path on or off. Changes recompute line stats immediately.",
      component: ExcludedPathToggles,
    }),
  ],
} satisfies PluginDefinition;
