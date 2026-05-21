import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleDropDependents } from "./internal/handle-drop-dependents";
import { dropDependents } from "../shared/endpoints";

export default {
  id: "drop-dependents",
  name: "Drop Dependents",
  httpRoutes: {
    [dropDependents.route]: handleDropDependents,
  },
} satisfies ServerPluginDefinition;
