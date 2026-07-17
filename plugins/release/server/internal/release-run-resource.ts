import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import type { ReleaseRun } from "../../core";
import { releaseRunResource as releaseRunDescriptor } from "../../core";
import { _releaseRuns } from "./tables";

// Per-id detail resource: the full run row (minus `pid`, the internal liveness
// marker) resolved by id, regardless of age. `mode:"push"` + no `identityTable`
// → the change-feed recomputes active subscriptions when `release_runs` changes,
// so a status flip on the open run re-pushes automatically (same as
// `taskDetailResource`). `id` is the PK, so at most one row.
export const releaseRunResource = defineResource(releaseRunDescriptor, {
  mode: "push",
  loader: async ({ id }): Promise<ReleaseRun | null> => {
    const [row] = await db
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
      .where(eq(_releaseRuns.id, id))
      .limit(1);
    return (row as unknown as ReleaseRun | undefined) ?? null;
  },
});
