import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { resetCompositionData, serveStatusEndpoint } from "../shared/endpoints";
import { handleReset } from "./internal/handle-reset";
import { handleServeStatus } from "./internal/handle-status";

export default {
  description:
    "Serve-liveness read for a composition namespace (is it actually served, and can this backend start one) plus the reset-to-first-launch endpoint: wipes ONLY that composition's DB + config back to what compose-serve provisions on a fresh serve, then restarts its backend. Never touches main.",
  httpRoutes: {
    [resetCompositionData.route]: handleReset,
    [serveStatusEndpoint.route]: handleServeStatus,
  },
} satisfies ServerPluginDefinition;
