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
// A change producer live in a suite that never booted the plugin graph (its
// changes routed through the suite's `route`, the real `routeChange` by
// default), and its coalescing window flushed by hand.
export { flushNow, mountProducersForTest } from "../internal/producer"; // The boot checks a produced table's readers must pass (A3p: no route needs a
// carried column; A1′: every table a resource depends on has a change source),
// for a suite that registers a REAL produced collection without booting the feed.
export { findCarriedProducedRoutes } from "../internal/produced-tables";
export { assertRouteTablesCovered } from "../internal/route-coverage";
