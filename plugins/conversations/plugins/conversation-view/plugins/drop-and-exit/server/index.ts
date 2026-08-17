import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleDropAndExit } from "./internal/handle-drop-and-exit";
import { dropAndExit } from "../core/endpoints";

export { dropTaskOnExit } from "./internal/drop-task-on-exit";

export default {
  httpRoutes: {
    [dropAndExit.route]: handleDropAndExit,
  },
} satisfies ServerPluginDefinition;
