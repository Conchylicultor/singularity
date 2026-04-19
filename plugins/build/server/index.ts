import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleBuild } from "./internal/handle-build";
import { handleBuildStatus } from "./internal/handle-build-status";

const plugin: ServerPluginDefinition = {
  id: "build",
  name: "Build",
  httpRoutes: {
    "POST /api/build": handleBuild,
    "GET /api/build/status": handleBuildStatus,
  },
};
export default plugin;
