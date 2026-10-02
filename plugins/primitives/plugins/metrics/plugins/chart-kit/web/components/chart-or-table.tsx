import type { ReactNode } from "react";
import { ChartTable } from "./chart-table";
import { TimeChart, type TimeChartProps } from "./time-chart";

export type ChartOrTableProps = TimeChartProps & {
  /** Show the table twin instead of the chart. */
  asTable: boolean;
  /** The table's bucket column header. */
  bucketHeader?: string;
};

/** A TimeChart, or its ChartTable twin — one switch, the same data. */
export function ChartOrTable({
  asTable,
  bucketHeader,
  ...chart
}: ChartOrTableProps): ReactNode {
  if (!asTable) return <TimeChart {...chart} />;
  return (
    <ChartTable
      buckets={chart.buckets}
      series={chart.series}
      compare={chart.compare}
      unit={chart.unit}
      bucketHeader={bucketHeader}
      total={chart.kind === "stack" && chart.series.length > 1}
      maxHeight={chart.height}
      onPick={chart.onPick}
    />
  );
}
