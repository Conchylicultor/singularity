import type { ReactNode } from "react";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { formatValue } from "@plugins/primitives/plugins/metrics/plugins/chart-kit/core";
import {
  ResourceErrorInline,
  type PagedResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import type { CatalogMetric, DrillItem, DrillPage } from "../../core";
import { useMetricDetails } from "../internal/use-metric";
import type { MetricBucket } from "./metric-card";

/** One metric whose records the drawer lists, with the params its card queried with. */
export interface DrillSource {
  metric: CatalogMetric;
  params: Record<string, unknown>;
}

/** What the drawer is open on: one bucket, and the metrics that can say what is behind it. */
export interface DrillTarget {
  bucket: MetricBucket;
  sources: DrillSource[];
}

export interface DrillDrawerProps {
  /** `null` = closed. */
  target: DrillTarget | null;
  onClose: () => void;
}

/**
 * The records behind one bucket, from the right edge: the bucket's label,
 * then one group per metric that declares a drill-down (the same records
 * listed once — metrics sharing a source and a drill label are one group).
 * Each group previews five and pages the rest on "Show all"; a record with a
 * link opens it.
 */
export function DrillDrawer({ target, onClose }: DrillDrawerProps): ReactNode {
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="data-[side=right]:sm:max-w-md">
        {target !== null && <DrawerBody target={target} />}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ target }: { target: DrillTarget }): ReactNode {
  const groups = dedupe(target.sources);
  return (
    <>
      <SheetHeader>
        <SheetTitle>{target.bucket.label}</SheetTitle>
        <SheetDescription>
          {target.bucket.partial
            ? "So far in this period"
            : "Everything in this period"}
        </SheetDescription>
      </SheetHeader>
      <Scroll fill>
        <Inset x="md" b="lg">
          <Stack gap="lg">
            {groups.length === 0 && (
              <Text variant="caption" tone="muted">
                Nothing on this board lists its records.
              </Text>
            )}
            {groups.map((g) => (
              <DrillGroup
                key={`${g.metric.source}:${g.metric.drill!.label}`}
                source={g}
                bucket={target.bucket}
              />
            ))}
          </Stack>
        </Inset>
      </Scroll>
    </>
  );
}

/** Metrics sharing a source and a drill label list the same records: one group. */
function dedupe(sources: readonly DrillSource[]): DrillSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (s.metric.drill === undefined) return false;
    const key = `${s.metric.source}:${s.metric.drill.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function DrillGroup({
  source,
  bucket,
}: {
  source: DrillSource;
  bucket: MetricBucket;
}): ReactNode {
  const { metric, params } = source;
  const label = metric.drill!.label;
  const details = useMetricDetails(metric.source, {
    metric: metric.id,
    interval: { start: bucket.start, end: bucket.end },
    split: null,
    params,
  });
  return (
    <Stack
      gap="xs"
      as="section"
      aria-label={label}
      data-drill-group={metric.id}
    >
      <DrillGroupBody label={label} metric={metric} details={details} />
    </Stack>
  );
}

/** A switch, not `matchResource`: the ready arm's paging handles are needed too. */
function DrillGroupBody({
  label,
  metric,
  details,
}: {
  label: string;
  metric: CatalogMetric;
  details: PagedResourceResult<DrillPage>;
}): ReactNode {
  switch (details.status) {
    case "loading":
      return (
        <>
          <Text variant="label">{label}</Text>
          <Loading variant="rows" count={3} />
        </>
      );
    case "error":
      // A page that failed keeps the ones already listed on screen, with the
      // failure under them; a first page that failed is the failure.
      return (
        <>
          {details.stale === undefined ? (
            <Text variant="label">{label}</Text>
          ) : (
            <DrillList label={label} metric={metric} pages={details.stale} />
          )}
          <ResourceErrorInline
            variant="inline"
            error={details.error}
            refetch={details.refetch}
            subject={label.toLowerCase()}
          />
        </>
      );
    case "ready":
      return (
        <>
          <DrillList label={label} metric={metric} pages={details.data} />
          {(details.canGrow || details.growing) && (
            <Button
              variant="link"
              onClick={details.loadMore}
              disabled={details.growing}
            >
              {details.data.length === 1
                ? `Show all ${details.data[0]!.total} →`
                : "Show more →"}
            </Button>
          )}
        </>
      );
  }
}

/** The group's heading with its total, then every record the pages hold. */
function DrillList({
  label,
  metric,
  pages,
}: {
  label: string;
  metric: CatalogMetric;
  pages: readonly DrillPage[];
}): ReactNode {
  const items = pages.flatMap((p) => p.items);
  // Every page carries the bucket's total; a read always holds at least one.
  const total = pages[0]!.total;
  return (
    <>
      <Text variant="label">
        {label}
        <Text tone="muted">{` · ${total}`}</Text>
      </Text>
      {items.length === 0 && (
        <Text variant="caption" tone="muted">
          None
        </Text>
      )}
      <Stack gap="none">
        {items.map((item) => (
          <DrillRow key={item.id} item={item} metric={metric} />
        ))}
      </Stack>
    </>
  );
}

function DrillRow({
  item,
  metric,
}: {
  item: DrillItem;
  metric: CatalogMetric;
}): ReactNode {
  return (
    <Row
      onClick={
        item.link === undefined ? undefined : () => navigate(item.link!.href)
      }
    >
      <Fill>
        <Stack gap="none">
          <Text>{item.title}</Text>
          {item.subtitle !== undefined && (
            <Text variant="caption" tone="muted">
              {item.subtitle}
            </Text>
          )}
        </Stack>
      </Fill>
      {item.value !== undefined && (
        <Text variant="caption" tone="subtle" className="tabular-nums">
          {formatValue(metric.unit, item.value)}
        </Text>
      )}
    </Row>
  );
}
