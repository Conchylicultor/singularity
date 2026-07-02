import { desc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { buildHistoryResource as buildHistoryDescriptor } from "../../shared";
import { _buildRuns } from "./tables";

export const buildHistoryResource = defineResource(buildHistoryDescriptor, {
  mode: "push",
  loader: async () =>
    // Explicit column list: `pid` is an internal liveness marker, not part of the
    // public BuildRun resource. Selecting it would break the schema's row type.
    // Scoped to this namespace's own runs: a worktree DB inherits main's rows via
    // the fork, so without this filter every worktree would surface main's stale
    // build state (e.g. a phantom "Build failed").
    db
      .select({
        id: _buildRuns.id,
        trigger: _buildRuns.trigger,
        commitHash: _buildRuns.commitHash,
        startedAt: _buildRuns.startedAt,
        finishedAt: _buildRuns.finishedAt,
        exitCode: _buildRuns.exitCode,
      })
      .from(_buildRuns)
      .where(eq(_buildRuns.namespace, currentWorktreeName()))
      .orderBy(desc(_buildRuns.startedAt))
      .limit(50),
});
