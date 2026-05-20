import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { isNull } from "drizzle-orm";
import { deleteTriggersFor, trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { ConfigV2, getConfig } from "@plugins/config_v2/server";
import { db } from "@plugins/database/server";
import { handleBuild } from "./internal/handle-build";
import { buildRunJob } from "./internal/build-run-job";
import { getMainAheadCount } from "./internal/git-status";
import { mainAheadCountResource } from "./internal/main-ahead-resource";
import { buildHistoryResource } from "./internal/build-history-resource";
import { frontendHashResource } from "./internal/frontend-hash-resource";
import { _buildRuns } from "./internal/tables";
import { buildConfig } from "../shared";
import { triggerBuildEndpoint } from "../core/endpoints";

export default {
  id: "build",
  name: "Build",
  contributions: [ConfigV2.Register({ descriptor: buildConfig }), Resource.Declare(mainAheadCountResource), Resource.Declare(buildHistoryResource), Resource.Declare(frontendHashResource)],
  httpRoutes: {
    [triggerBuildEndpoint.route]: handleBuild,
  },
  register: [buildRunJob],
  onReady: async () => {
    const orphans = await db
      .update(_buildRuns)
      .set({ finishedAt: new Date() })
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

    const { autoBuild } = getConfig(buildConfig);
    if (autoBuild) {
      const aheadCount = await getMainAheadCount();
      if (aheadCount > 0) {
        await buildRunJob.enqueue({});
      }
    }
  },
} satisfies ServerPluginDefinition;
