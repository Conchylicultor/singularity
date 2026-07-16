// Build-process marker for dist-comparing checks.
//
// `./singularity build` runs the check fleet IN PARALLEL with the frontend
// build and publishes the fresh dist only afterwards — so a check that compares
// the currently-DEPLOYED dist against the current tree (e.g.
// `web-artifacts:map-in-sync`) would fail exactly when the build is about to
// reconcile them: the dist it inspects is the one this very build replaces.
// Such checks skip (and must return `null` from `cacheSignature()`, so the skip
// is never recorded as a cached pass) when the marker is set.
//
// Env-based on purpose: `build` runs checks in-process, `push` re-runs them in
// a fresh subprocess and `./singularity check` in its own process — neither
// inherits a build's environment, so both verify the deployed dist for real.

const BUILD_IN_PROGRESS_ENV = "SINGULARITY_BUILD_IN_PROGRESS";

/** Called once at the start of the `build` command's action. */
export function markBuildInProgress(): void {
  process.env[BUILD_IN_PROGRESS_ENV] = "1";
}

/** True inside a `./singularity build` process (checks racing the publish). */
export function isBuildInProgress(): boolean {
  return process.env[BUILD_IN_PROGRESS_ENV] === "1";
}
