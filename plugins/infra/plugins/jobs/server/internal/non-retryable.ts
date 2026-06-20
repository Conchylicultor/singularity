// Globally-shared brand. `Symbol.for` returns the same Symbol across module
// reloads (HMR), worker pools, and even separate copies of @plugins/jobs that
// might exist if a worktree links it through different paths — so
// `isNonRetryableError()` is robust where `instanceof NonRetryableError` would
// silently fail when the class identity differs between throw and catch. Same
// rationale as `SuspendSignal`'s brand in step-ctx.ts.
const NON_RETRYABLE_BRAND: unique symbol = Symbol.for(
  "@plugins/jobs:NonRetryableError",
) as never;

// Thrown from a job `run` to declare the failure DETERMINISTIC: the same stored
// input will fail identically on every retry, so retrying is pure waste. The
// worker collapses the job's retry budget so graphile dead-letters it after the
// current attempt — one reported dead-letter instead of churning the full
// `maxAttempts` retry budget — while keeping it loud and visible (reported, and
// surfaced as a dead-letter by queue-health).
//
// Use ONLY for failures that cannot succeed on replay: schema/contract drift,
// permanently-invalid stored payloads. NEVER for transient failures (DB
// hiccups, network blips, lock contention) where a later retry could succeed —
// those must throw a plain Error so graphile retries normally.
export class NonRetryableError extends Error {
  // Brand shows up on the instance for `isNonRetryableError()`. Symbol-keyed so
  // it doesn't leak into JSON / log serialisation.
  readonly [NON_RETRYABLE_BRAND] = true;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NonRetryableError";
  }
}

// Brand check that survives module-identity differences. Use this (never
// `instanceof`) in the worker's failure path.
export function isNonRetryableError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as Record<symbol, unknown>)[NON_RETRYABLE_BRAND] === true
  );
}
