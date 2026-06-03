import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { inArray, isNull } from "drizzle-orm";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { ConfigV2, getConfig } from "@plugins/config_v2/server";
import { db } from "@plugins/database/server";
import { handleBuild } from "./internal/handle-build";
import { isPidAlive } from "./internal/run-build";
import { buildRunJob } from "./internal/build-run-job";
import { getMainAheadCount } from "./internal/git-status";
import { mainAheadCountResource } from "./internal/main-ahead-resource";
import { buildHistoryResource } from "./internal/build-history-resource";
import { frontendHashResource } from "./internal/frontend-hash-resource";
import { _buildRuns } from "./internal/tables";
export { _buildRuns } from "./internal/tables";
import { buildConfig } from "../shared";
import { triggerBuildEndpoint } from "../core/endpoints";

export default {
  name: "Build",
  contributions: [ConfigV2.Register({ descriptor: buildConfig }), Resource.Declare(mainAheadCountResource), Resource.Declare(buildHistoryResource), Resource.Declare(frontendHashResource), Trigger({ on: refAdvanced.where({ refName: "refs/heads/main" }), do: buildRunJob, with: {}, oneShot: false })],
  httpRoutes: {
    [triggerBuildEndpoint.route]: handleBuild,
  },
  register: [buildRunJob],
  onReady: async () => {
    const unfinished = await db
      .select({ id: _buildRuns.id, pid: _buildRuns.pid })
      .from(_buildRuns)
      .where(isNull(_buildRuns.finishedAt));
    const orphanIds = unfinished.filter((r) => !isPidAlive(r.pid)).map((r) => r.id);
    if (orphanIds.length > 0) {
      await db
        .update(_buildRuns)
        .set({ finishedAt: new Date(), exitCode: -1 })
        .where(inArray(_buildRuns.id, orphanIds));
      buildHistoryResource.notify();
    }

    if (!isMain()) return;

    const { autoBuild } = getConfig(buildConfig);
    if (autoBuild) {
      const aheadCount = await getMainAheadCount();
      if (aheadCount > 0) {
        await buildRunJob.enqueue({});
      }
    }
  },
} satisfies ServerPluginDefinition;
