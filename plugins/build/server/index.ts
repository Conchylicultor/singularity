import type { ServerPluginDefinition } from "@server/types";
import { deleteTriggersFor, trigger } from "@plugins/infra/plugins/events/server";
import { pushLanded } from "@plugins/tasks-core/server";
import { readConfig } from "@plugins/config/server";
import { handleBuild } from "./internal/handle-build";
import { handleBuildStatus } from "./internal/handle-build-status";
import { buildRunJob } from "./internal/build-run-job";
import { getMainAheadCount } from "./internal/git-status";
import { buildConfig } from "../shared/config";

export default {
  id: "build",
  name: "Build",
  config: buildConfig,
  httpRoutes: {
    "POST /api/build": handleBuild,
    "GET /api/build/status": handleBuildStatus,
  },
  register: [buildRunJob],
  onReady: async () => {
    // Idempotent re-subscribe: remove any stale pushes.landed → buildRunJob
    // trigger rows (from a prior server incarnation), then insert a single
    // persistent (oneShot:false) trigger so every pushes.landed emit enqueues
    // a build.
    await deleteTriggersFor(buildRunJob);
    await trigger({
      on: pushLanded,
      do: buildRunJob,
      with: {},
      oneShot: false,
    });

    // Catch-up: pushes that landed while the server was down don't re-emit
    // on restart, so enqueue once if main has commits ahead of the last
    // build. The job itself rechecks the autoBuild config — this pre-check
    // avoids touching git on every start when auto-build is disabled.
    const { autoBuild } = await readConfig(buildConfig);
    if (autoBuild) {
      const aheadCount = await getMainAheadCount();
      if (aheadCount > 0) {
        await buildRunJob.enqueue({});
      }
    }
  },
} satisfies ServerPluginDefinition;
