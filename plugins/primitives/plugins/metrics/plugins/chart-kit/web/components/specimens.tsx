import { useState, type ReactNode } from "react";
import type { SpecimenProps } from "@plugins/plugin-meta/plugins/specimens/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  COMPLETED,
  COMPLETED_PREVIOUS,
  COST_BINS,
  FILED_VS_COMPLETED,
  NET,
  OPEN,
  OPEN_PREVIOUS,
  SPECIMEN_BUCKETS,
  SPEND,
} from "../internal/fixtures";
import { ChartOrTable } from "./chart-or-table";
import { ChartState } from "./chart-state";
import { Histogram } from "./histogram";
import { Sparkline } from "./sparkline";
import { TimeChart } from "./time-chart";

function Exhibit({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Card>
      <Stack gap="sm">
        <Text variant="subheading">{title}</Text>
        {children}
      </Stack>
    </Card>
  );
}

/**
 * Every TimeChart kind on fixed September data: a stack with a compare line, an
 * area with a gap and a compare line, a line, a mirror, a net, and a stack in
 * dollars with the table toggle. The last bucket is partial in each.
 */
export function TimeChartSpecimen(_props: SpecimenProps): ReactNode {
  const [asTable, setAsTable] = useState(false);
  return (
    <Inset pad="md">
      <Stack gap="md">
        <Exhibit title="Tasks completed — stack, by category, vs previous period">
          <TimeChart
            label="Tasks completed per day, by category"
            kind="stack"
            buckets={SPECIMEN_BUCKETS}
            series={COMPLETED}
            compare={COMPLETED_PREVIOUS}
            onPick={() => {}}
          />
        </Exhibit>
        <Exhibit title="Open tasks — area, with a gap, vs previous period">
          <TimeChart
            label="Open tasks at the end of each day"
            kind="area"
            buckets={SPECIMEN_BUCKETS}
            series={OPEN}
            compare={OPEN_PREVIOUS}
          />
        </Exhibit>
        <Exhibit title="Filed and completed — line">
          <TimeChart
            label="Tasks filed and completed per day"
            kind="line"
            buckets={SPECIMEN_BUCKETS}
            series={FILED_VS_COMPLETED}
          />
        </Exhibit>
        <Exhibit title="Completed up, filed down — mirror">
          <TimeChart
            label="Tasks completed (up) and filed (down) per day"
            kind="mirror"
            buckets={SPECIMEN_BUCKETS}
            series={FILED_VS_COMPLETED}
          />
        </Exhibit>
        <Exhibit title="Completed − filed — net">
          <TimeChart
            label="Completed minus filed per day"
            kind="net"
            buckets={SPECIMEN_BUCKETS}
            series={NET}
          />
        </Exhibit>
        <Exhibit title="Spend — stack in dollars, with the table twin">
          <Stack gap="sm">
            <Button variant="outline" onClick={() => setAsTable((t) => !t)}>
              {asTable ? "Show chart" : "Show as table"}
            </Button>
            <ChartOrTable
              asTable={asTable}
              label="Spend per day, by model"
              kind="stack"
              unit="usd"
              bucketHeader="Day"
              buckets={SPECIMEN_BUCKETS}
              series={SPEND}
            />
          </Stack>
        </Exhibit>
        <Exhibit title="Chart states">
          <ChartState state="loading" height={120} />
          <ChartState state="empty" height={120} />
          <ChartState
            state="error"
            height={120}
            message="Couldn't load this metric"
            onRetry={() => {}}
          />
        </Exhibit>
      </Stack>
    </Inset>
  );
}

/** The cost-per-conversation distribution on fixed bins. */
export function HistogramSpecimen(_props: SpecimenProps): ReactNode {
  return (
    <Inset pad="md">
      <Exhibit title="Cost per conversation">
        <Histogram
          label="Conversations by cost"
          bins={COST_BINS}
          countLabel="conversations"
        />
      </Exhibit>
    </Inset>
  );
}

/** Sparklines as a tile shows them: a trend, one with a gap, a flat one, a single value. */
export function SparklineSpecimen(_props: SpecimenProps): ReactNode {
  return (
    <Inset pad="md">
      <Stack direction="row" gap="lg" align="center">
        <Sparkline values={COMPLETED[0]!.values} />
        <Sparkline values={OPEN[0]!.values} />
        <Sparkline values={[5, 5, 5, 5]} />
        <Sparkline values={[7]} />
      </Stack>
    </Inset>
  );
}
