import { desc, eq } from "drizzle-orm";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { buildHistoryResource as buildHistoryDescriptor } from "../../shared";
import { _buildRuns } from "./tables";

// Compiled keyed query-resource, declared K/FULL (`recompute`): this is a
// windowed `orderBy startedAt desc LIMIT 50` read. A run entering or leaving the
// top-50 is a membership change a per-id scoped refill cannot express, so the
// loader always re-runs the FULL query and `diffKeyedFull` still ships each
// changed run as a single keyed row (the prior push resource FULL-recomputed
// with no keyed diffing — this is a strict improvement).
//
// `currentWorktreeName()` reads `process.env.SINGULARITY_WORKTREE`, constant for
// the process lifetime (one backend per worktree), so the static `where`
// evaluated once at module eval is correct. The explicit column list keeps `pid`
// (an internal liveness marker, not part of BuildRun) off the wire. Scoped to
// this namespace's own runs: a worktree DB inherits main's rows via the fork, so
// without this filter every worktree would surface main's stale build state
// (e.g. a phantom "Build failed").
export const buildHistoryResource = queryResource(buildHistoryDescriptor, {
  from: _buildRuns,
  select: {
    id: _buildRuns.id,
    trigger: _buildRuns.trigger,
    commitHash: _buildRuns.commitHash,
    startedAt: _buildRuns.startedAt,
    finishedAt: _buildRuns.finishedAt,
    exitCode: _buildRuns.exitCode,
  },
  where: eq(_buildRuns.namespace, currentWorktreeName()),
  orderBy: desc(_buildRuns.startedAt),
  limit: 50,
  recompute: {
    kind: "full",
    reason:
      "windowed read (orderBy startedAt desc LIMIT 50): a run entering/leaving the top-50 is a membership change a scoped per-id refill cannot express",
  },
});
