import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

/**
 * One optimistic surface's ops were durably rejected by the server: the mutation
 * returned 2xx, yet `DIVERGENCE_MISS_LIMIT` consecutive authoritative snapshots
 * failed to reflect them. Carries only bounded, serializable coordinates — never
 * the raw `vars` (unbounded, possibly unserializable); `opSummaries` is the
 * consumer's own `describeOp(vars)` rendering.
 */
export interface OptimisticDivergenceReport {
  resourceKey: string;
  params: Record<string, string> | null;
  label: string | null;
  misses: number;
  opSummaries: string[];
}

// A module-level soft-reporter slot, mirroring `error-boundary`'s
// `boundaryReportSink`. The primitive must not import `reports`, so a domain
// plugin (`reports.optimistic-divergence`) registers the mapping to report() at
// mount time. `emit` never throws — divergence is detected on a reconcile path.
export const optimisticDivergenceReportSink = defineReportSink<OptimisticDivergenceReport>();
