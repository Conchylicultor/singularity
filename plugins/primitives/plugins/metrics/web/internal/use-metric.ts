import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import {
  useLive,
  type LivePagesResult,
} from "@plugins/network/plugins/live/web";
import {
  metricCatalog,
  metricDetails,
  metricQuery,
  type Catalog,
  type DetailsSelector,
  type DrillItem,
  type DrillMeta,
  type MetricQuery,
  type MetricResult,
} from "../../core";

// The three metrics reads, each a live value (`core/live.ts`): a change the
// metric's source announces refetches what a tab shows — the server watches
// the source while the tab holds the read, and the query cache keeps the last
// answer on screen while the refetch runs. A changed question (a new range, a
// split) is a new tuple, and shows its own loading state.

/** The served catalog: every source, metric and breakdown. Fixed per process. */
export function useMetricCatalog(): ResourceResult<Catalog> {
  return useLive(metricCatalog);
}

/** One metric (or breakdown) query; the server resolves its source from the metric id. */
export function useMetric(query: MetricQuery): ResourceResult<MetricResult> {
  return useLive(metricQuery, query);
}

/** The first page a drawer shows before "Show all". */
const DETAILS_PREVIEW = 5;

/**
 * The records behind one bucket (optionally one split key), paged by the
 * provider's cursor: a preview page of `DETAILS_PREVIEW`, then a page of
 * `DRILL_PAGE` per `loadMore`; `meta.total` is how many there are in all.
 */
export function useMetricDetails(
  selector: DetailsSelector,
): LivePagesResult<DrillItem, DrillMeta> {
  return useLive(metricDetails, selector, { first: DETAILS_PREVIEW });
}
