import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleSlowOpsCluster } from "./internal/handle-cluster";
import { getSlowOpsCluster } from "../shared/endpoints";

export default {
  description:
    "Cross-worktree fan-out endpoint: merges every worktree DB fork's slow_ops into one cluster response.",
  httpRoutes: {
    [getSlowOpsCluster.route]: handleSlowOpsCluster,
  },
} satisfies ServerPluginDefinition;
