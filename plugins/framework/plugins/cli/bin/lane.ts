// Lane classification — the single home for "who is waiting on this work".
//
// The CLI origins that acquire a host CPU grant map to two lanes; one is
// human-blocking, the other is not:
//
//   interactive  ←  main build,   push (its nested check)
//   background   ←  agent build,  direct agent check
//
// The `Lane` a build/check passes to `withHostGrant` IS this fact. `publishLane`
// additionally mirrors it into `SINGULARITY_LANE` so a subprocess that does not
// inherit a full grant (`SINGULARITY_HOST_GRANT`) still classifies correctly;
// `inheritedGrant()` reads the same var to reconstruct the inherited lane.
//
// Keyed on whether this is the human-blocking (interactive) origin, NOT on the
// branch string — build knows it via `branch === "main"` and check via
// `slug === MAIN_WORKTREE_NAME`, but both collapse to the same boolean here, so
// the two spellings can never drift on the lane decision. See
// research/2026-07-10-global-host-admission-unified-budget.md.

import type { Lane } from "@plugins/infra/plugins/host-admission/core";

/** Env signal naming the lane the current process's checks run in. */
export const LANE_ENV = "SINGULARITY_LANE";

/** The human-blocking (interactive) origin ⇒ interactive lane; else background. */
export function laneFor(isInteractiveOrigin: boolean): Lane {
  return isInteractiveOrigin ? "interactive" : "background";
}

/**
 * Publish the lane into the environment (so any inheriting subprocess sees it) —
 * UNLESS an ancestor already classified us. The push-nested check inherits
 * `interactive` (via the parent push's grant env) and runs on the rebased AGENT
 * branch; without this not-clobber it would reclassify itself to background off
 * its own branch — the exact trap the interactive lane's reserved floor exists
 * to prevent. build is never nested, so the guard is a harmless no-op there;
 * keeping one entry point means the two callers can't diverge.
 */
export function publishLane(isInteractiveOrigin: boolean): void {
  if (process.env[LANE_ENV]) return; // an ancestor already decided the lane
  process.env[LANE_ENV] = laneFor(isInteractiveOrigin);
}
