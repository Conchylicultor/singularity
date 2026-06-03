import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { forkScope as forkScopeEndpoint, deleteScope as deleteScopeEndpoint } from "../core";
import { initConfigWatcher, shutdownConfigWatcher } from "./internal/config-watcher";
import { initRegistry, shutdownRegistry } from "./internal/registry";
import { configV2ServerResource, configV2ConflictsServerResource, configV2TiersServerResource, configV2ScopeForkedServerResource } from "./internal/resource";
import { handleForkScope, handleDeleteScope } from "./internal/scope-handlers";

export { ConfigV2 } from "./internal/contribution";
export { forkConfig } from "./internal/fork";
export { getConfig, setConfig, setConfigByPath, resetConfigByPath, watchConfig, acknowledgeConflictByPath, deleteOverrideByPath, getRawFileContent } from "./internal/registry";
export { getAllDescriptors, getScopedDescriptors } from "./internal/resource";
export { forkScope, deleteScope } from "./internal/scope-fork";
export { registerFieldStorageProvider, getFieldStorageProvider, hasFieldStorageProvider } from "./internal/field-storage-providers";
export type { FieldStorageProvider } from "./internal/field-storage-providers";

export default {
  name: "Config v2",
  description: "Typed JSONC config handles for server plugins.",
  contributions: [Resource.Declare(configV2ServerResource), Resource.Declare(configV2ConflictsServerResource), Resource.Declare(configV2TiersServerResource), Resource.Declare(configV2ScopeForkedServerResource)],
  httpRoutes: {
    [forkScopeEndpoint.route]: handleForkScope,
    [deleteScopeEndpoint.route]: handleDeleteScope,
  },
  async onReady() {
    await initConfigWatcher();
    await initRegistry();
  },
  async onShutdown() {
    shutdownRegistry();
    await shutdownConfigWatcher();
  },
} satisfies ServerPluginDefinition;
