import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleBuild } from "./internal/handle-build";

const plugin: ServerPluginDefinition = {
  id: "build",
  name: "Build",
  httpRoutes: {
    "POST /api/build": handleBuild,
  },
};
export default plugin;
