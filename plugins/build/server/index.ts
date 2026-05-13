import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { isNull } from "drizzle-orm";
import { deleteTriggersFor, trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { Config, readConfig } from "@plugins/config/server";
import { db } from "@plugins/database/server";
import { handleBuild } from "./internal/handle-build";
import { handleBuildStatus } from "./internal/handle-build-status";
import { buildRunJob } from "./internal/build-run-job";
import { getMainAheadCount } from "./internal/git-status";
import { mainAheadCountResource } from "./internal/main-ahead-resource";
import { buildHistoryResource } from "./internal/build-history-resource";
import { _buildRuns } from "./internal/tables";
import { buildConfig } from "@plugins/build/shared";

export default {
  id: "build",
  name: "Build",
  contributions: [Config.Field(buildConfig), Resource.Declare(mainAheadCountResource), Resource.Declare(buildHistoryResource)],
  httpRoutes: {
    "POST /api/build": handleBuild,
    "GET /api/build/status": handleBuildStatus,
  },
  register: [buildRunJob],
  onReady: async () => {
    const orphans = await db
      .update(_buildRuns)
      .set({ finishedAt: new Date(), exitCode: 0 })
      .where(isNull(_buildRuns.finishedAt))
      .returning({ id: _buildRuns.id });
    if (orphans.length > 0) {
      buildHistoryResource.notify();
    }

    if (!isMain()) return;

    await deleteTriggersFor(buildRunJob);
    await trigger({
      on: refAdvanced.where({ refName: "refs/heads/main" }),
      do: buildRunJob,
      with: {},
      oneShot: false,
    });

    const { autoBuild } = await readConfig(buildConfig);
    if (autoBuild) {
      const aheadCount = await getMainAheadCount();
      if (aheadCount > 0) {
        await buildRunJob.enqueue({});
      }
    }
  },
} satisfies ServerPluginDefinition;
