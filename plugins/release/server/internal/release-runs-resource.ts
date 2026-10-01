import { eq } from "drizzle-orm";
import { runtimeNamespace } from "@plugins/infra/plugins/runtime-identity/core";
import { serveCollection } from "@plugins/network/plugins/live/server";
import { releaseHistory, releaseRuns } from "../../core";
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

// The history window: the same table, this namespace's runs only — a worktree
// DB inherits main's rows through the fork, and without the base predicate
// every worktree would list main's runs. A predicate over a column that never
// changes after insert, so it moves nothing but the scope. Written over `j`
// so it is read at bind (`releaseHistory` takes the history surface's custom
// columns, so it compiles once contributions are collected), when the
// process's namespace is declared.
export const releaseHistoryServed = serveCollection(releaseHistory, {
  from: _releaseRuns,
  where: (j) => eq(j.base.namespace, runtimeNamespace()),
});
