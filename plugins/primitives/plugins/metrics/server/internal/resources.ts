import { serveValue } from "@plugins/network/plugins/live/server";
import { metricCatalog, metricDetails, metricQuery } from "../../core";
import { getMetricRegistry } from "./registry";
import { catalogOptions, detailsOptions, queryOptions } from "./served";
import { createSourceWatch } from "./source-watch";

// The metrics values, served on the worktree runtime over the process's
// registry and ONE source watch — so a query and a drill-down of one source
// share its `changes` subscription.

const watch = createSourceWatch((id) => getMetricRegistry().source(id));

export const metricCatalogServed = serveValue(
  metricCatalog,
  catalogOptions(getMetricRegistry),
);

export const metricQueryServed = serveValue(
  metricQuery,
  queryOptions(getMetricRegistry, watch),
);

export const metricDetailsServed = serveValue(
  metricDetails,
  detailsOptions(getMetricRegistry, watch),
);
