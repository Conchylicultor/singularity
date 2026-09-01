/**
 * This plugin's supervised-run kind id — the filename prefix of every deploy
 * transcript and exit marker (`deploy-<legId>.log` / `.exit-code`).
 *
 * Its own module, and a leaf, so that reading a leg's transcript
 * (`transcript.ts`) and defining the kind (`run-state.ts`) can share one
 * spelling without the reader importing the writer: the kind's own `finish`
 * reads a transcript, so the two files would otherwise form a cycle.
 *
 * Lowercase alphanumeric with no separator, which `assertRunKindId` enforces at
 * module eval — a kind id containing a `-` would make the artifact prune of one
 * kind reap another's transcripts.
 */
export const DEPLOY_RUN_KIND_ID = "deploy";
