import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleList } from "./internal/handle-list";
import { configOrphans } from "../shared/endpoints";

export default {
  description:
    "Read-only audit of orphaned user-layer config files whose defineConfig descriptor is no longer live.",
  httpRoutes: {
    [configOrphans.route]: handleList,
  },
} satisfies ServerPluginDefinition;
