import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { queryDeploymentAnalytics } from "../core";
import { handleQueryDeploymentAnalytics } from "./internal/handle-query";

export default {
  description:
    "Reads a deployment's analytics report over SSH: resolves the deployment's server and pinned SSH target, curls the install's host-only report through its own gateway on the loopback port, and answers a discriminated result (report, refused, or which of SSH, the request or the answer failed).",
  httpRoutes: {
    [queryDeploymentAnalytics.route]: handleQueryDeploymentAnalytics,
  },
} satisfies ServerPluginDefinition;
