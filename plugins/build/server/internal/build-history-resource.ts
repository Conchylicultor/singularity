import { desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { BuildRunSchema } from "../../shared";
import { _buildRuns } from "./tables";
import { z } from "zod";

export const buildHistoryResource = defineResource({
  key: "build.history",
  mode: "push",
  schema: z.array(BuildRunSchema),
  loader: async () =>
    // Explicit column list: `pid` is an internal liveness marker, not part of the
    // public BuildRun resource. Selecting it would break the schema's row type.
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
      .orderBy(desc(_buildRuns.startedAt))
      .limit(50),
});
