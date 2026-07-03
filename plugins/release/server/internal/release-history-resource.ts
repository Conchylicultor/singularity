import { desc, eq } from "drizzle-orm";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
// `key` / `schema` come from the shared client descriptor — the single source of
// truth both runtimes read. The server adds only the drizzle declaration.
import { releaseHistoryResource as releaseHistoryDescriptor } from "../../core/resources";
import { _releaseRuns } from "./tables";

// Compiled keyed query-resource, declared K/FULL (`recompute`), NOT
// identityTable-scoped: this is a windowed `orderBy startedAt desc LIMIT 50`
// read. A run entering or leaving the top-50 is a membership change a per-id
// scoped refill cannot express (and a scoped refill of an out-of-window row
// would corrupt the snapshot), so the loader always re-runs the FULL query and
// `diffKeyedFull` still ships each changed run as a single keyed row.
//
// `currentWorktreeName()` reads `process.env.SINGULARITY_WORKTREE`, constant for
// the process lifetime (one backend per worktree), so the static `where`
// evaluated once at module eval is correct. The explicit column list keeps `pid`
// (an internal liveness marker, not part of ReleaseRun) off the wire. Scoped to
// this namespace's own runs: a worktree DB inherits main's rows via the fork, so
// without this filter every worktree would surface main's runs.
export const releaseHistoryResource = queryResource(releaseHistoryDescriptor, {
  from: _releaseRuns,
  select: {
    id: _releaseRuns.id,
    composition: _releaseRuns.composition,
    target: _releaseRuns.target,
    namespace: _releaseRuns.namespace,
    status: _releaseRuns.status,
    startedAt: _releaseRuns.startedAt,
    finishedAt: _releaseRuns.finishedAt,
    exitCode: _releaseRuns.exitCode,
    platform: _releaseRuns.platform,
    artifactPath: _releaseRuns.artifactPath,
    port: _releaseRuns.port,
    error: _releaseRuns.error,
  },
  where: eq(_releaseRuns.namespace, currentWorktreeName()),
  orderBy: desc(_releaseRuns.startedAt),
  limit: 50,
  recompute: {
    kind: "full",
    reason:
      "windowed read (orderBy startedAt desc LIMIT 50): a run entering/leaving the top-50 is a membership change a scoped per-id refill cannot express",
  },
});
