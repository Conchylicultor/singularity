import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleBuild } from "./internal/handle-build";
import { handleBuildStatus } from "./internal/handle-build-status";
import { startAutoBuildWatcher } from "./internal/auto-build-watcher";
import { buildConfig } from "../shared/config";

export default {
  id: "build",
  name: "Build",
  config: buildConfig,
  httpRoutes: {
    "POST /api/build": handleBuild,
    "GET /api/build/status": handleBuildStatus,
  },
  onReady: startAutoBuildWatcher,
} satisfies ServerPluginDefinition;
