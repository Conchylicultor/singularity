import { desc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
// `key` / `schema` come from the shared client descriptor — the single source of
// truth both runtimes read. The server adds only the DB half (loader). See the
// two-arg `defineResource` form in server-core/CLAUDE.md.
import { releaseHistoryResource as releaseHistoryDescriptor } from "../../core/resources";
import { _releaseRuns } from "./tables";

export const releaseHistoryResource = defineResource(releaseHistoryDescriptor, {
  mode: "push",
  identityTable: "release_runs",
  loader: async () =>
    // Explicit column list: `pid` is an internal liveness marker, not part of the
    // public ReleaseRun resource. Selecting it would break the schema's row type.
    // Scoped to this namespace's own runs: a worktree DB inherits main's rows via
    // the fork, so without this filter every worktree would surface main's runs.
    db
      .select({
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
      })
      .from(_releaseRuns)
      .where(eq(_releaseRuns.namespace, currentWorktreeName()))
      .orderBy(desc(_releaseRuns.startedAt))
      .limit(50),
});
