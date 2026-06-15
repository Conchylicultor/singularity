import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { getCompositionData } from "@plugins/plugin-meta/plugins/composition/core";
import { handleCompositionData } from "./internal/data-handler";

export default {
  description:
    "Serves the classified edge graph + declared composition manifests for the Studio closure visualization.",
  httpRoutes: {
    [getCompositionData.route]: handleCompositionData,
  },
} satisfies ServerPluginDefinition;
