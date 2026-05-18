import type { ServerPluginDefinition } from "@server/types";
import { handleHealth } from "./internal/handle-health";
import { getHealth } from "../shared/endpoints";

export default {
  id: "health",
  name: "Health",
  description: "Liveness endpoint used by clients to detect server restarts.",
  httpRoutes: {
    [getHealth.route]: handleHealth,
  },
} satisfies ServerPluginDefinition;
