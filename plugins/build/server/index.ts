import type { ServerPluginDefinition } from "@server/types";
import { deleteTriggersFor, trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
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
    // Auto-build only on main — all worktrees share .git/refs, so every
    // server sees refAdvanced and would each spawn its own build.
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
