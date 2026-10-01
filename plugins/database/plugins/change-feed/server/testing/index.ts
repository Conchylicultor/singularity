// Creating the change-feed's changelog table in a suite's own database, without
// rebuilding every trigger.
export { ensureChangelogTable } from "../internal/triggers";
// An isolated LISTEN consumer on a suite's own database (the production one
// reads the worktree's connection), routing through whatever `route` the suite
// hands it — `routeChange` for the real runtime.
export { createChangeFeedListener } from "../internal/listener";
// The feed's triggers on a suite's own throwaway database (with the suite's
// own exclusions — nothing is contributed in an un-booted process).
export { rebuildTriggers } from "../internal/triggers";
