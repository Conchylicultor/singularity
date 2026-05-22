import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { initConfigWatcher, shutdownConfigWatcher } from "./internal/config-watcher";
import { initRegistry, shutdownRegistry } from "./internal/registry";
import { configV2ServerResource } from "./internal/resource";

export { ConfigV2 } from "./internal/contribution";
export { forkConfig } from "./internal/fork";
export { getConfig, setConfig, setConfigByPath, resetConfigByPath, watchConfig } from "./internal/registry";

export default {
  id: "config-v2",
  name: "Config v2",
  description: "Typed JSONC config handles for server plugins.",
  contributions: [Resource.Declare(configV2ServerResource)],
  async onReady() {
    await initConfigWatcher();
    initRegistry();
  },
  async onShutdown() {
    shutdownRegistry();
    await shutdownConfigWatcher();
  },
} satisfies ServerPluginDefinition;
