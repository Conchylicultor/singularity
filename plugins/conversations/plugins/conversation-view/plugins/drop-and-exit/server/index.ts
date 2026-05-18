import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleDropAndExit } from "./internal/handle-drop-and-exit";
import { dropAndExit } from "../shared/endpoints";

export default {
  id: "drop-and-exit",
  name: "Drop and Exit",
  httpRoutes: {
    [dropAndExit.route]: handleDropAndExit,
  },
} satisfies ServerPluginDefinition;
