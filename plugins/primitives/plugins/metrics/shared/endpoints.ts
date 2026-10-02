import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import {
  CatalogSchema,
  DetailsQuerySchema,
  DrillPageSchema,
  MetricQuerySchema,
  MetricResultSchema,
} from "../core";

// Every source, metric and breakdown with its label, unit, splits and param
// specs. Fixed per boot: registration happens once, on the server.
export const getMetricCatalog = defineEndpoint({
  route: "GET /api/metrics/catalog",
  response: CatalogSchema,
});

// POST: the query (range, params) is structured. A metric id answers a series,
// a breakdown id a breakdown.
export const queryMetric = defineEndpoint({
  route: "POST /api/metrics/query",
  body: MetricQuerySchema,
  response: MetricResultSchema,
});

// The records behind one bucket, one page at a time.
export const metricDetails = defineEndpoint({
  route: "POST /api/metrics/details",
  body: DetailsQuerySchema,
  response: DrillPageSchema,
});
