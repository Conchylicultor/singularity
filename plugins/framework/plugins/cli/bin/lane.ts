// Lane classification — the single home for "who is waiting on this work".
//
// Three CLI origins run checks; two of them are human-blocking and one is not:
//
//   interactive  ←  main build,   push (its nested check)
//   background   ←  agent build,  direct agent check
//
// This is the SAME fact three sites used to spell three different ways
// (`branch === "main"`, `SINGULARITY_HOST_SLOT_HELD`, a build slotKind ternary).
// The lane is published to the environment as SINGULARITY_LANE so an in-process
// check — and any check subprocess that inherits our env — can key its host-wide
// worker budget on it. It is DELIBERATELY not `SINGULARITY_HOST_SLOT_HELD`: that
// means "don't take a CLI slot" (a different fact that merely correlates today).
//
// Keyed on whether this is the human-blocking (interactive) origin, NOT on the
// branch string — build knows it via `branch === "main"` and check via
// `slug === MAIN_WORKTREE_NAME`, but both collapse to the same boolean here, so
// the two spellings can never drift on the lane decision. See
// research/2026-07-09-global-type-check-worker-host-budget.md.

export type Lane = "interactive" | "background";

/** Env signal naming the lane the current process's checks run in. */
export const LANE_ENV = "SINGULARITY_LANE";

/** The human-blocking (interactive) origin ⇒ interactive lane; else background. */
export function laneFor(isInteractiveOrigin: boolean): Lane {
  return isInteractiveOrigin ? "interactive" : "background";
}

/**
 * Publish the lane into the environment (so in-process checks and any inheriting
 * subprocess see it) — UNLESS an ancestor already classified us. The push-nested
 * check inherits `interactive` from push.ts and runs on the rebased AGENT branch;
 * without this not-clobber it would reclassify itself to background off its own
 * branch and queue behind demoted agent workers — the exact trap the reserved
 * push slot exists to prevent. build is never nested, so the guard is a harmless
 * no-op there; keeping one entry point means the two callers can't diverge.
 */
export function publishLane(isInteractiveOrigin: boolean): void {
  if (process.env[LANE_ENV]) return; // an ancestor already decided the lane
  process.env[LANE_ENV] = laneFor(isInteractiveOrigin);
}
