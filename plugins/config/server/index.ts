import type { ServerPluginDefinition } from "@server/types";
import { plugins as allPlugins } from "@server/plugins";
import { configResource } from "./internal/resource";
import { buildRegistry } from "./internal/registry";
import {
  handleDelete,
  handleGet,
  handlePatch,
  handleSpecs,
} from "./internal/handlers";

export { configResource } from "./internal/resource";
export { readConfig } from "./internal/read-config";

export default {
  id: "config",
  name: "Config",
  description:
    "Per-worktree key/value config. Plugins declare typed fields via defineConfig; values expose in the Settings pane.",
  httpRoutes: {
    "GET /api/config": handleGet,
    "GET /api/config/specs": handleSpecs,
    "PATCH /api/config": handlePatch,
    "DELETE /api/config/:key": handleDelete,
  },
  resources: [configResource],
  async onReady() {
    buildRegistry(allPlugins);
  },
} satisfies ServerPluginDefinition;
