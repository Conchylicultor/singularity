import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleHealth } from "./internal/handle-health";
import { getHealth } from "../shared/endpoints";

export default {
  name: "Health",
  description: "Liveness endpoint used by clients to detect server restarts.",
  httpRoutes: {
    [getHealth.route]: handleHealth,
  },
} satisfies ServerPluginDefinition;
