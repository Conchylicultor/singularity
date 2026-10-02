import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Specimens } from "@plugins/plugin-meta/plugins/specimens/web";
import {
  HistogramSpecimen,
  SparklineSpecimen,
  TimeChartSpecimen,
} from "./components/specimens";

export { TimeChart, type TimeChartProps } from "./components/time-chart";
export { Sparkline, type SparklineProps } from "./components/sparkline";
export {
  Histogram,
  type HistogramBin,
  type HistogramProps,
} from "./components/histogram";
export { ChartTable, type ChartTableProps } from "./components/chart-table";
export {
  ChartOrTable,
  type ChartOrTableProps,
} from "./components/chart-or-table";
export { ChartState, type ChartStateProps } from "./components/chart-state";
export { Legend, type LegendProps } from "./components/legend";

export default {
  description:
    "Hand-rolled SVG chart kit, knowing nothing about metrics: TimeChart (area / line / stack / mirror / net, a dashed compare line, gaps for null, partial buckets drawn lighter / dashed, hover + keyboard tooltip, onPick), Sparkline, Histogram, the ChartTable twin, ChartOrTable and ChartState (loading / empty / error at chart height). Series take --categorical-1…10 in fixed order, the tail folding into Other; chrome is neutral tokens.",
  contributions: [
    Specimens.Specimen({
      match: "chart-kit/time-chart",
      label: "Time chart (every kind, compare, partial bucket)",
      widths: [360, 640, 900],
      component: TimeChartSpecimen,
    }),
    Specimens.Specimen({
      match: "chart-kit/histogram",
      label: "Histogram",
      widths: [360, 640],
      component: HistogramSpecimen,
    }),
    Specimens.Specimen({
      match: "chart-kit/sparkline",
      label: "Sparklines",
      component: SparklineSpecimen,
    }),
  ],
} satisfies PluginDefinition;
