import { runtimeNamespace } from "@plugins/infra/plugins/runtime-identity/core";
import { eq } from "drizzle-orm";
import { serveCollection } from "@plugins/network/plugins/live/server";
import { _buildRuns } from "@plugins/build/plugins/run-ledger/server";
import { buildHistory } from "../../core";

// The build history over `build_runs`: its window (newest `startedAt` first,
// 50) and its `:rows` point sibling. Every `BuildRun` field is a `_buildRuns`
// column by name, and the projection is exactly those fields, so `pid` (an
// internal liveness marker, not part of BuildRun) stays off the wire.
//
// The base `where` scopes it to THIS namespace's own runs: a worktree DB
// inherits main's rows via the fork, so without it every worktree would surface
// main's stale build state (e.g. a phantom "Build failed"). It is ANDed into the
// window and the point reads alike, so a run id from another namespace is not
// found. `runtimeNamespace()` is declared once at this process's entry point and
// never changes (one backend per namespace), so evaluating it once at module
// eval is correct. The window's `WHERE namespace = ? ORDER BY started_at DESC,
// id` is the namespace-scoped ordered read `build_runs_ns_started_id_idx`
// (run-ledger) exists for.
export const buildHistoryServed = serveCollection(buildHistory, {
  from: _buildRuns,
  where: eq(_buildRuns.namespace, runtimeNamespace()),
});
