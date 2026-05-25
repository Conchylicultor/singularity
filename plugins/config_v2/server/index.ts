import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { initConfigWatcher, shutdownConfigWatcher } from "./internal/config-watcher";
import { initRegistry, shutdownRegistry } from "./internal/registry";
import { configV2ServerResource, configV2ConflictsServerResource, configV2TiersServerResource } from "./internal/resource";

export { ConfigV2 } from "./internal/contribution";
export { forkConfig } from "./internal/fork";
export { getConfig, setConfig, setConfigByPath, resetConfigByPath, watchConfig, acknowledgeConflictByPath, deleteOverrideByPath, getRawFileContent } from "./internal/registry";
export { getAllDescriptors } from "./internal/resource";
export { registerFieldStorageProvider, getFieldStorageProvider, hasFieldStorageProvider } from "./internal/field-storage-providers";
export type { FieldStorageProvider } from "./internal/field-storage-providers";

export default {
  id: "config-v2",
  name: "Config v2",
  description: "Typed JSONC config handles for server plugins.",
  contributions: [Resource.Declare(configV2ServerResource), Resource.Declare(configV2ConflictsServerResource), Resource.Declare(configV2TiersServerResource)],
  async onReady() {
    await initConfigWatcher();
    await initRegistry();
  },
  async onShutdown() {
    shutdownRegistry();
    await shutdownConfigWatcher();
  },
} satisfies ServerPluginDefinition;
