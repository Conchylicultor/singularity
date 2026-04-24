import type { ServerPluginDefinition } from "@server/types";
import { handleHealth } from "./internal/handle-health";

export default {
  id: "health",
  name: "Health",
  description: "Liveness endpoint used by clients to detect server restarts.",
  httpRoutes: {
    "GET /api/health": handleHealth,
  },
} satisfies ServerPluginDefinition;
