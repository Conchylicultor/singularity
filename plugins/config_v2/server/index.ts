import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { initRegistry, shutdownRegistry } from "./internal/registry";
import { configV2ServerResource } from "./internal/resource";

export { ConfigV2 } from "./internal/contribution";
export { getConfig, setConfig, watchConfig } from "./internal/registry";

export default {
  id: "config-v2",
  name: "Config v2",
  description: "Typed JSONC config handles for server plugins.",
  contributions: [Resource.Declare(configV2ServerResource)],
  async onReady() {
    await initRegistry();
  },
  async onShutdown() {
    shutdownRegistry();
  },
} satisfies ServerPluginDefinition;
