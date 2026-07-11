import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

/**
 * One optimistic surface's server-acked ops and the server's snapshots durably
 * disagree. Two kinds, discriminated by `kind`:
 *
 * - `"superseded"` — a snapshot causally AT-OR-AFTER the op's commit (strict
 *   watermark comparison, Rule B) still didn't reflect it: a newer server write
 *   overwrote its effect. The op was DROPPED from the overlay — the healthy
 *   newer-truth outcome, reported for observability.
 * - `"stalled"` — `DIVERGENCE_REPORT_MISSES` consecutive authoritative
 *   snapshots failed to reflect a server-acked op that carries no causal proof
 *   of supersession. The op is KEPT (never-revert) and keeps replaying; this
 *   one-shot report is the investigation signal for a wrong
 *   `apply`/`isConfirmedBy` pair.
 *
 * Carries only bounded, serializable coordinates — never the raw `vars`
 * (unbounded, possibly unserializable); `opSummaries` is the consumer's own
 * `describeOp(vars)` rendering.
 */
export interface OptimisticDivergenceReport {
  kind: "superseded" | "stalled";
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
