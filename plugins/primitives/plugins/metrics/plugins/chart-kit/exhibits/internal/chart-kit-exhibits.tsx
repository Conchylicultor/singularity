import { useState, type ReactNode } from "react";
import {
  isolatedExhibit,
  type Exhibit,
} from "@plugins/plugin-meta/plugins/exhibits/core";
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
  SEPTEMBER_BUCKETS,
  SPEND,
} from "./september-data";
import { ChartOrTable } from "../../web/components/chart-or-table";
import { ChartState } from "../../web/components/chart-state";
import { Histogram } from "../../web/components/histogram";
import { Sparkline } from "../../web/components/sparkline";
import { TimeChart } from "../../web/components/time-chart";

function Panel({
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
function TimeChartExhibit(): ReactNode {
  const [asTable, setAsTable] = useState(false);
  return (
    <Inset pad="md">
      <Stack gap="md">
        <Panel title="Tasks completed — stack, by category, vs previous period">
          <TimeChart
            label="Tasks completed per day, by category"
            kind="stack"
            buckets={SEPTEMBER_BUCKETS}
            series={COMPLETED}
            compare={COMPLETED_PREVIOUS}
            onPick={() => {}}
          />
        </Panel>
        <Panel title="Open tasks — area, with a gap, vs previous period">
          <TimeChart
            label="Open tasks at the end of each day"
            kind="area"
            buckets={SEPTEMBER_BUCKETS}
            series={OPEN}
            compare={OPEN_PREVIOUS}
          />
        </Panel>
        <Panel title="Filed and completed — line">
          <TimeChart
            label="Tasks filed and completed per day"
            kind="line"
            buckets={SEPTEMBER_BUCKETS}
            series={FILED_VS_COMPLETED}
          />
        </Panel>
        <Panel title="Completed up, filed down — mirror">
          <TimeChart
            label="Tasks completed (up) and filed (down) per day"
            kind="mirror"
            buckets={SEPTEMBER_BUCKETS}
            series={FILED_VS_COMPLETED}
          />
        </Panel>
        <Panel title="Completed − filed — net">
          <TimeChart
            label="Completed minus filed per day"
            kind="net"
            buckets={SEPTEMBER_BUCKETS}
            series={NET}
          />
        </Panel>
        <Panel title="Spend — stack in dollars, with the table twin">
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
              buckets={SEPTEMBER_BUCKETS}
              series={SPEND}
            />
          </Stack>
        </Panel>
        <Panel title="Chart states">
          <ChartState state="loading" height={120} />
          <ChartState state="empty" height={120} />
          <ChartState
            state="error"
            height={120}
            message="Couldn't load this metric"
            onRetry={() => {}}
          />
        </Panel>
      </Stack>
    </Inset>
  );
}

/** The cost-per-conversation distribution on fixed bins. */
function HistogramExhibit(): ReactNode {
  return (
    <Inset pad="md">
      <Panel title="Cost per conversation">
        <Histogram
          label="Conversations by cost"
          bins={COST_BINS}
          countLabel="conversations"
        />
      </Panel>
    </Inset>
  );
}

/** Sparklines as a tile shows them: a trend, one with a gap, a flat one, a single value. */
function SparklineExhibit(): ReactNode {
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

// Isolated exhibits: every component here takes plain props and reads nothing
// from the running app — no slots, config or live data, and its colours are
// the static `--categorical-*` / chrome tokens in ui-kit's theme CSS — so each
// renders on a bare page as well as inside the app.
export const chartKitExhibits: Exhibit[] = [
  isolatedExhibit({
    id: "chart-kit/time-chart",
    label: "Time chart (every kind, compare, partial bucket)",
    widths: [360, 640, 900],
    render: () => <TimeChartExhibit />,
  }),
  isolatedExhibit({
    id: "chart-kit/histogram",
    label: "Histogram",
    widths: [360, 640],
    render: () => <HistogramExhibit />,
  }),
  isolatedExhibit({
    id: "chart-kit/sparkline",
    label: "Sparklines",
    // Sparklines are fixed-size marks; an isolated exhibit must state widths,
    // so these are the 360 / 640 / 960 every consumer used to fall back to.
    widths: [360, 640, 960],
    render: () => <SparklineExhibit />,
  }),
];
