import { serveCollection } from "@plugins/network/plugins/live/server";
import { releaseRuns } from "../../core";
import { _releaseRuns } from "./tables";

// Server half of the per-id run read: the lookup-only collection served from
// `release_runs`. Every `ReleaseRunSchema` field binds to its column by name,
// and the projection is exactly the schema's keys — so `pid`, the internal
// liveness marker, never reaches the wire. No base `where`: a run resolves by
// id whichever namespace produced it (the history window is what scopes). The
// `:rows` point routing sends a status flip to that run's readers alone.
export const releaseRunsServed = serveCollection(releaseRuns, {
  from: _releaseRuns,
});
