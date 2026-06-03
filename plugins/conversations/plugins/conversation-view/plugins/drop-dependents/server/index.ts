import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleDropDependents } from "./internal/handle-drop-dependents";
import { dropDependents } from "../shared/endpoints";

export default {
  name: "Drop Dependents",
  httpRoutes: {
    [dropDependents.route]: handleDropDependents,
  },
} satisfies ServerPluginDefinition;
