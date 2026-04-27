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
