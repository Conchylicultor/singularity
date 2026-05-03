import type { ServerPluginDefinition } from "@server/types";
import { deleteTriggersFor, trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { readConfig } from "@plugins/config/server";
import { handleBuild } from "./internal/handle-build";
import { handleBuildStatus } from "./internal/handle-build-status";
import { buildRunJob } from "./internal/build-run-job";
import { getMainAheadCount } from "./internal/git-status";
import { mainAheadCountResource } from "./internal/main-ahead-resource";
import { buildConfig } from "../shared/config";

export default {
  id: "build",
  name: "Build",
  config: buildConfig,
  resources: [mainAheadCountResource],
  httpRoutes: {
    "POST /api/build": handleBuild,
    "GET /api/build/status": handleBuildStatus,
  },
  register: [buildRunJob],
  onReady: async () => {
    // Idempotent re-subscribe: remove any stale git.refAdvanced → buildRunJob
    // trigger rows (from a prior server incarnation), then insert a single
    // persistent (oneShot:false) trigger so every refAdvanced for
    // refs/heads/main enqueues a build.
    await deleteTriggersFor(buildRunJob);
    await trigger({
      on: refAdvanced.where({ refName: "refs/heads/main" }),
      do: buildRunJob,
      with: {},
      oneShot: false,
    });

    // Catch-up: ref advances that landed while the server was down don't
    // re-emit on restart, so enqueue once if main is ahead of the last
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
