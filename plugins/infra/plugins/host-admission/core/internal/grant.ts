// The grant contract — pure interface + env-var names, so both runtimes (the
// server impl in `../../server`, and the check contract in
// `framework/tooling/core`) share ONE definition without pulling in `bun:ffi`.
//
// A grant is admission returned as *tokens*, not permission. A holder does not
// declare what it fans out into; it SUBDIVIDES the units it was given. Every
// heavy child spends one via `run`; a subprocess child inherits the *number*
// via `env()` and rebuilds its own in-process semaphore, so nothing a holder
// spawns re-acquires host-wide.

/** Env var carrying the inherited unit count to a subprocess child (a positive int). */
export const HOST_GRANT_ENV = "SINGULARITY_HOST_GRANT";
/** Env var carrying the inherited lane to a subprocess child. */
export const HOST_LANE_ENV = "SINGULARITY_LANE";

/**
 * A subdivisible admission grant. `units` is how many host CPU slots the holder
 * actually acquired (always `>= 1`). `run` spends one unit through an in-process
 * semaphore (so a holder's own fan-out is bounded to `units`). `env()` is what a
 * subprocess child inherits so its `inheritedGrant()` reconstructs the same
 * budget without acquiring anything host-wide.
 */
export interface Grant {
  readonly units: number;
  run<T>(fn: () => Promise<T>): Promise<T>;
  env(): Record<string, string>;
}
