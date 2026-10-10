import { liveValue } from "@plugins/network/plugins/live/core";
import {
  CatalogSchema,
  DetailsSelectorSchema,
  DrillItemSchema,
  DrillMetaSchema,
  MetricQuerySchema,
  MetricResultSchema,
} from "./wire";

// The three reads every metrics surface makes, as live values — served in
// `server/internal/resources.ts`, read with `useLive` in
// `web/internal/use-metric.ts`. A source's `changes` reaches every subscribed
// query and drill-down of it (`server/internal/source-watch.ts`), so a number
// on screen refreshes without polling.

/** Every source, metric and breakdown with its label, unit, splits and param specs. Fixed per process. */
export const metricCatalog = liveValue("metrics.catalog", {
  schema: CatalogSchema,
});

/**
 * One metric (a series) or breakdown query. A structured question, so a typed
 * query value; on-demand, because an evaluation is a provider call each tab
 * refetches after a change rather than one the server pushes to every tab.
 */
export const metricQuery = liveValue("metrics.query", {
  schema: MetricResultSchema,
  query: MetricQuerySchema,
  load: "on-demand",
});

/** The page size of a drill-down after its preview. */
export const DRILL_PAGE = 50;

/**
 * The records behind one bucket (or one series of it), paged by the
 * provider's cursor — each loaded page live; the bucket's total is the page
 * meta.
 */
export const metricDetails = liveValue("metrics.details", {
  query: DetailsSelectorSchema,
  paged: {
    item: DrillItemSchema,
    id: "id",
    meta: DrillMetaSchema,
    limit: DRILL_PAGE,
  },
  load: "on-demand",
});
