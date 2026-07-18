import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { resetCompositionData } from "../shared/endpoints";
import { handleReset } from "./internal/handle-reset";

export default {
  description:
    "Reset-to-first-launch endpoint for a served composition: wipes ONLY that composition's DB + config back to what compose-serve provisions on a fresh serve, then restarts its backend. Never touches main.",
  httpRoutes: {
    [resetCompositionData.route]: handleReset,
  },
} satisfies ServerPluginDefinition;
