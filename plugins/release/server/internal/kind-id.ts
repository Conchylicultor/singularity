/**
 * This plugin's supervised-run kind id — the filename prefix of every release
 * transcript and exit marker (`release-<runId>.log` / `.exit-code`).
 *
 * Its own module, and a leaf, so reading a run's transcript (`transcript.ts`,
 * which the logs endpoint calls) and defining the kind (`run-state.ts`, whose
 * own `finish` writes the ledger) can share one spelling without either
 * importing the other.
 *
 * Lowercase alphanumeric with no separator, which `assertRunKindId` enforces at
 * module eval — a kind id containing a `-` would make the artifact prune of one
 * kind reap another's transcripts.
 */
export const RELEASE_RUN_KIND_ID = "release";
