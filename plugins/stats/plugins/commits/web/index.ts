import type { PluginDefinition } from "@core";
import { Stats } from "@plugins/stats/web";
import { Config } from "@plugins/config/web";
import { CommitsSection } from "./components/commits-section";
import { ExcludedPathToggles } from "./components/excluded-path-toggles";
import { LinesChartsSection } from "./components/lines-charts";
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
  fillGaps,
} from "./components/chart-primitives";

export default {
  id: "stats-commits",
  name: "Stats: Commits",
  description: "Commit-based stats: commits and lines of change over time.",
  contributions: [
    Stats.Chart({
      id: "commits",
      title: "Commits",
      component: CommitsSection,
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
