import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

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
  contributions: [],
} satisfies PluginDefinition;
