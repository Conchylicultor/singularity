import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleHealth } from "./internal/handle-health";

const plugin: ServerPluginDefinition = {
  id: "health",
  name: "Health",
  description: "Liveness endpoint used by clients to detect server restarts.",
  httpRoutes: {
    "GET /api/health": handleHealth,
  },
};
export default plugin;
