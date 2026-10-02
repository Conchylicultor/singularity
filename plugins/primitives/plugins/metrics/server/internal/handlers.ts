import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import {
  InvalidRangeError,
  evaluateBreakdown,
  evaluateMetric,
  parseParams,
  type DetailsQuery,
  type DrillPage,
  type MetricQuery,
  type MetricResult,
  type ParamSpecs,
} from "../../core";
import {
  getMetricCatalog,
  metricDetails,
  queryMetric,
} from "../../shared/endpoints";
import { getMetricRegistry, type MetricRegistry } from "./registry";

// The three endpoints. Every request error the caller can make — an unknown
// id, split or param, a bad range, a drill-down on a metric without one — is a
// 400 naming it; everything past validation that throws is a provider bug and
// stays a 500.

export async function runQuery(
  registry: MetricRegistry,
  query: MetricQuery,
  now: Date,
): Promise<MetricResult> {
  const entry = registry.lookup(query.metric);
  if (entry.kind === "unknown") {
    throw new HttpError(400, `unknown metric "${query.metric}"`);
  }
  const params = parsedParams(entry.specs, query.params);
  try {
    if (entry.kind === "breakdown") {
      if ("split" in query) {
        throw new HttpError(400, `breakdown "${query.metric}" cannot be split`);
      }
      return await evaluateBreakdown(
        entry.impl.breakdown,
        { range: query.range, tz: query.tz, params },
        entry.impl.evaluate,
        now,
      );
    }
    const decl = entry.impl.metric;
    if ("split" in query) {
      if (!decl.splits.some((s) => s.id === query.split)) {
        throw new HttpError(
          400,
          `metric "${decl.id}" has no split "${query.split}"`,
        );
      }
      return await evaluateMetric(
        decl,
        { range: query.range, tz: query.tz, params, split: query.split },
        entry.impl.evaluate,
        now,
      );
    }
    return await evaluateMetric(
      decl,
      { range: query.range, tz: query.tz, params, compare: query.compare },
      entry.impl.evaluate,
      now,
    );
  } catch (err) {
    if (err instanceof InvalidRangeError) throw new HttpError(400, err.message);
    throw err;
  }
}

export async function runDetails(
  registry: MetricRegistry,
  query: DetailsQuery,
): Promise<DrillPage> {
  const entry = registry.lookup(query.metric);
  if (entry.kind !== "metric") {
    throw new HttpError(400, `unknown metric "${query.metric}"`);
  }
  const { metric: decl, details } = entry.impl;
  if (details === undefined) {
    throw new HttpError(400, `metric "${decl.id}" has no details`);
  }
  const split = query.split;
  if (split !== null && !decl.splits.some((s) => s.id === split.id)) {
    throw new HttpError(400, `metric "${decl.id}" has no split "${split.id}"`);
  }
  if (Date.parse(query.interval.start) >= Date.parse(query.interval.end)) {
    throw new HttpError(400, "interval start must be before its end");
  }
  return details({
    interval: query.interval,
    split,
    params: parsedParams(entry.specs, query.params),
    cursor: query.cursor,
    limit: query.limit,
  });
}

function parsedParams(
  specs: ParamSpecs,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = parseParams(specs, raw);
  if (!parsed.ok) throw new HttpError(400, parsed.error);
  return parsed.values;
}

export const handleCatalog = implement(
  getMetricCatalog,
  () => getMetricRegistry().catalog,
);

export const handleQuery = implement(queryMetric, ({ body }) =>
  runQuery(getMetricRegistry(), body, new Date()),
);

export const handleDetails = implement(metricDetails, ({ body }) =>
  runDetails(getMetricRegistry(), body),
);
