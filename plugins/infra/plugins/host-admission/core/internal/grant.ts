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

/**
 * Observability hooks for a `withHostGrant` acquire. Neither gates behavior; they
 * exist so a caller can make the grant queue visible (a profiler span, an op-log
 * wait segment, a log line) without this plugin knowing about any of that.
 *
 * Structurally the host-semaphore primitive's `AcquireHooks` MINUS `lane` — and
 * that omission is the point. `lane` is `withHostGrant`'s own opt (it selects the
 * reserved-floor slot window, so it DOES gate behavior); leaving it out of the
 * hooks makes it structurally impossible for a caller to smuggle a second,
 * conflicting lane in through the observability channel.
 *
 * Declared here rather than re-exported from `packages/host-semaphore` because a
 * cross-plugin re-export is banned (root CLAUDE.md) and, more concretely, the
 * `host-pools-declared` check makes `@plugins/packages/plugins/host-semaphore/server`
 * an import only `host-admission/server` may name — so a consumer literally cannot
 * reach that barrel to spell the type.
 */
export interface GrantHooks {
  /**
   * The slow path was entered (every slot in the lane's window busy), BEFORE any
   * child is spawned. Never fires on the fast path. Lets a caller *open* a
   * "waiting for a slot" span, which `onAcquired` (fired once, at acquisition)
   * can never express.
   */
  onWaitStart?(): void;
  /**
   * Always fires, fast path or slow, exactly once, at acquisition, before the
   * body runs. Its argument is the milliseconds spent waiting (≈0 on the fast
   * path).
   */
  onAcquired?(waitMs: number): void;
}
