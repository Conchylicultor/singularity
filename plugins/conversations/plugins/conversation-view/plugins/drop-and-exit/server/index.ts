import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleDropAndExit } from "./internal/handle-drop-and-exit";
import { dropAndExit } from "../core/endpoints";

export default {
  httpRoutes: {
    [dropAndExit.route]: handleDropAndExit,
  },
} satisfies ServerPluginDefinition;
