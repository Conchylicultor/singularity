import type { ServerPluginDefinition } from "@server/types";
import { isNull } from "drizzle-orm";
import { deleteTriggersFor, trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { readConfig } from "@plugins/config/server";
import { db } from "@plugins/database/server";
import { handleBuild } from "./internal/handle-build";
import { handleBuildStatus } from "./internal/handle-build-status";
import { buildRunJob } from "./internal/build-run-job";
import { getMainAheadCount } from "./internal/git-status";
import { mainAheadCountResource } from "./internal/main-ahead-resource";
import { buildHistoryResource } from "./internal/build-history-resource";
import { _buildRuns } from "./internal/tables";
import { buildConfig } from "../shared/config";

export default {
  id: "build",
  name: "Build",
  config: buildConfig,
  resources: [mainAheadCountResource, buildHistoryResource],
  httpRoutes: {
    "POST /api/build": handleBuild,
    "GET /api/build/status": handleBuildStatus,
  },
  register: [buildRunJob],
  onReady: async () => {
    if (!isMain()) return;

    // Mark orphaned builds as succeeded — if this server booted, the last build worked.
    const orphans = await db
      .update(_buildRuns)
      .set({ finishedAt: new Date(), exitCode: 0 })
      .where(isNull(_buildRuns.finishedAt))
      .returning({ id: _buildRuns.id });
    if (orphans.length > 0) {
      buildHistoryResource.notify();
    }

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
