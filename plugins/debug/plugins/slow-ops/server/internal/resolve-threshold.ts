import type { SlowSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { getJobSlowThresholdMs } from "@plugins/infra/plugins/jobs/server";
import { getRouteSlowThresholdMs } from "@plugins/infra/plugins/endpoints/core";
import type { ConfigValues } from "@plugins/config_v2/core";
import type { slowOpConfig } from "../../core";

export type Thresholds = ConfigValues<(typeof slowOpConfig)["fields"]>;

// Map a span to its configured threshold — the single source of "what is slow"
// (shared with the flight-recorder plugin via the server barrel). The
// `sub`/`push` origin entries and the `flush` notify-flush cycle all wrap
// loaders, so they share the loader threshold (no separate config knob). The
// `job` case resolves the per-job override (`defineJob({ slowThresholdMs })`)
// via the span label (the job name), falling back to the global `jobMs` config
// default when the job declares none.
export function resolveSlowThreshold(span: SlowSpan, t: Thresholds): number {
  switch (span.kind) {
    case "http":
      // A route may hold a tighter bar than the global `httpMs` via
      // `defineEndpoint({ slowThresholdMs })` (regression backstop). The span
      // label is the route. Honored as long as it sits at/above the perf floor
      // below (min config threshold; `dbMs` default 500 ms, well under 1 s uses).
      return getRouteSlowThresholdMs(span.label) ?? t.httpMs;
    case "db":
      return t.dbMs;
    case "job":
      return getJobSlowThresholdMs(span.label) ?? t.jobMs;
    case "loader":
    case "sub":
    case "push":
    case "flush":
      return t.loaderMs;
  }
}
