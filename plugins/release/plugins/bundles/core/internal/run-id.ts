import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A release run's id, declared once (`plugins/ids`). It names the run's
 * versioned out-dir (`<comp>-<target>/<run-id>/`) AND its `release_runs` row,
 * so it lives here, in the DB-free bundle registry both the CLI and the engine
 * import. Runs minted as `release-<ms>-<6>` stay recognised;
 * `releaseRunIdKind.stampedAtMs` orders both generations by when they were cut.
 */
export const releaseRunIdKind = defineIdKind({
  prefix: "release",
  label: "Release",
});

export type ReleaseRunId = IdOf<typeof releaseRunIdKind>;
