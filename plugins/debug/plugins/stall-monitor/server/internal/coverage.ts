import type {
  FlightWindow,
  FlightSpan,
} from "@plugins/infra/plugins/runtime-profiler/core";

/**
 * The result of testing whether any tracked span covered a freeze.
 *
 * `unspanned: true` ⇒ NO entry span was in flight across the freeze, so the CPU
 * burst inflated nothing the profiler can see (`get_runtime_profile` /
 * `slow_ops` / `byParent` are all blind to it) — the `prewarmBundle` class. The
 * stall report is then the ONLY surface that names it. `unspanned: false` ⇒ some
 * entry span was open across it, so the cost landed in that span's `selfMs`
 * (visible, a victim we can trace); `coveringSpan` names the first such span.
 */
export type CoverageResult =
  | { unspanned: false; coveringSpan: { kind: string; label: string } }
  | { unspanned: true };

// How much shorter than the freeze a span may be and still count as "covering"
// it — a small slack for the sampler/capture jitter around the freeze edges.
function coverThresholdMs(durationMs: number): number {
  return durationMs - Math.min(200, durationMs * 0.1);
}

/**
 * Classify a freeze of `durationMs` against the flight window captured at the
 * trip instant. A span COVERS the freeze iff it is an ENTRY span (not a leaf
 * `db` span — a db leaf brackets in time but is I/O-waiting, not CPU-covering)
 * whose in-window lifetime `[t0, t1 ?? atMs]` is at least
 * `durationMs − min(200, 10%)`. Returns the first covering span; if none covers,
 * the freeze is unspanned.
 *
 * Pure — no clock, no I/O — so it is exhaustively unit-tested (coverage.test.ts).
 * The residual imprecision is a conservative FALSE-NEGATIVE only (an unrelated
 * concurrent request open across the freeze reads as "covered", so we withhold
 * the badge) — the safe direction, and benign for the primary target (boot-time
 * freezes have no concurrent requests → correctly badged).
 */
export function classifyCoverage(
  fw: FlightWindow,
  durationMs: number,
): CoverageResult {
  const threshold = coverThresholdMs(durationMs);
  const spans: FlightSpan[] = [...fw.open, ...fw.completed];
  for (const s of spans) {
    if (s.kind === "db") continue; // a db leaf is I/O-waiting, not CPU-covering
    const end = s.t1 ?? fw.atMs;
    const spanMs = end - s.t0;
    if (spanMs >= threshold) {
      return { unspanned: false, coveringSpan: { kind: s.kind, label: s.label } };
    }
  }
  return { unspanned: true };
}
