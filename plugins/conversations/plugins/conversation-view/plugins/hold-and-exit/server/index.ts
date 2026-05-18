import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleHoldAndExit } from "./internal/handle-hold-and-exit";
import { holdAndExit } from "../shared/endpoints";

export default {
  id: "hold-and-exit",
  name: "Hold and Exit",
  httpRoutes: {
    [holdAndExit.route]: handleHoldAndExit,
  },
} satisfies ServerPluginDefinition;
