import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  getMetricCatalog,
  metricDetails,
  queryMetric,
} from "../shared/endpoints";
import { handleCatalog, handleDetails, handleQuery } from "./internal/handlers";
import { metricRevisionServed } from "./internal/revision";

export {
  MetricsServer,
  serveBreakdown,
  serveMetric,
} from "./internal/contribution";
export type {
  BreakdownImpl,
  DetailsCtx,
  MetricDetails,
  MetricImpl,
  SourceImpl,
} from "./internal/contribution";
export { sqlFlow, sqlLevel } from "./internal/sql";
export { boardConfigRegistrations } from "./internal/board-config";
export type { SqlFlowSpec, SqlLevelSpec, SqlSplit } from "./internal/sql";

export default {
  description:
    "Metrics engine: the MetricsServer.Source contribution (a source's metrics and breakdowns bound to their evaluators), the catalog / query / details endpoints evaluating any of them through the one tz-aware bucketing engine, the sqlFlow / sqlLevel helpers joining a table against the engine's intervals, and the metricRevision live value each source's `changes` moves.",
  httpRoutes: {
    [getMetricCatalog.route]: handleCatalog,
    [queryMetric.route]: handleQuery,
    [metricDetails.route]: handleDetails,
  },
  contributions: [...metricRevisionServed.declare],
} satisfies ServerPluginDefinition;
