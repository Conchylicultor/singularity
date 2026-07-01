// Cycle-breaker: both registry.ts and worker.ts need these values. Keeping
// them here means registry→worker and worker→registry remain a one-way edge
// each (both depending on constants, never on each other's transitive shape).

// Single shared Graphile task. Each job's own name lives in the payload, so
// adding a new job at module load never requires restarting the worker. See
// research/2026-04-24-global-jobs-events-split.md §"Layer 1".
export const JOB_TASK = "jobs.run";

// Small default so permanently-broken handlers don't thrash Graphile forever.
// Callers override per-job via `defineJob({ maxAttempts })` or per-enqueue via
// `enqueue(input, { maxAttempts })`.
export const DEFAULT_MAX_ATTEMPTS = 5;

// --- Durable-wait bounds ------------------------------------------------------
// A `ctx.waitFor` that omits `timeoutMs` used to schedule no timeout racer at
// all, so the durable run suspended forever. These bounds make every wait
// bounded by construction: an omitted timeout falls back to the default, any
// explicit value is clamped to the ceiling, and the ONLY way to wait forever is
// the deliberate, greppable `unbounded: true` opt-out. See
// research/2026-07-01-jobs-bounded-durable-waits.md.

// Safety-net fallback applied when a caller omits `timeoutMs`. This is NOT a
// tuned business SLA — callers that care pass an explicit `timeoutMs` (e.g. the
// user-input workflow step). It only guarantees an untimed wait still reaches a
// terminal state instead of hanging indefinitely.
export const DEFAULT_WAIT_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Hard structural ceiling: any explicit `timeoutMs` is clamped to this. Kept
// generous so it never clips legitimate business values (e.g. user-input's own
// 30-day cap). If a real caller ever needs longer, raise this ceiling rather
// than reaching for `unbounded: true`.
export const MAX_WAIT_TIMEOUT_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

/**
 * Resolve a caller's `ctx.waitFor` timeout into a bounded ms value, or `null`
 * for the explicit unbounded opt-out (in which case no timeout racer is armed):
 * - `unbounded` truthy → `null` (deliberate forever-wait)
 * - `timeoutMs` omitted → {@link DEFAULT_WAIT_TIMEOUT_MS}
 * - `timeoutMs` present → clamped to `[1, MAX_WAIT_TIMEOUT_MS]`
 */
export function resolveWaitTimeoutMs(
  timeoutMs: number | undefined,
  unbounded: boolean | undefined,
): number | null {
  if (unbounded) return null;
  if (timeoutMs === undefined) return DEFAULT_WAIT_TIMEOUT_MS;
  return Math.min(Math.max(1, timeoutMs), MAX_WAIT_TIMEOUT_MS);
}
