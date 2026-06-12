import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { forkScope as forkScopeEndpoint, deleteScope as deleteScopeEndpoint, forkDescriptorScope as forkDescriptorScopeEndpoint, removeDescriptorScope as removeDescriptorScopeEndpoint, configSnapshot as configSnapshotEndpoint } from "../core";
import { initConfigWatcher, shutdownConfigWatcher } from "./internal/config-watcher";
import { initRegistry, shutdownRegistry } from "./internal/registry";
import { configV2ServerResource, configV2ConflictsServerResource, configV2ScopesServerResource, configV2TiersServerResource, configV2ScopeForkedServerResource } from "./internal/resource";
import { handleForkScope, handleDeleteScope, handleForkDescriptorScope, handleRemoveDescriptorScope } from "./internal/scope-handlers";
import { handleConfigSnapshot } from "./internal/snapshot-handler";

export { ConfigV2 } from "./internal/contribution";
export { forkConfig } from "./internal/fork";
export { getConfig, setConfig, setConfigByPath, resetConfigByPath, watchConfig, acknowledgeConflictByPath, deleteOverrideByPath, mergeConflictByPath, getRawFileContent } from "./internal/registry";
export { getAllDescriptors, getScopedDescriptors } from "./internal/resource";
export { forkScope, deleteScope, forkDescriptorScope, removeDescriptorScope } from "./internal/scope-fork";
export { registerFieldStorageProvider, getFieldStorageProvider, hasFieldStorageProvider } from "./internal/field-storage-providers";
export type { FieldStorageProvider } from "./internal/field-storage-providers";

export default {
  description: "Typed JSONC config handles for server plugins.",
  contributions: [Resource.Declare(configV2ServerResource), Resource.Declare(configV2ConflictsServerResource), Resource.Declare(configV2ScopesServerResource), Resource.Declare(configV2TiersServerResource), Resource.Declare(configV2ScopeForkedServerResource)],
  httpRoutes: {
    [forkScopeEndpoint.route]: handleForkScope,
    [deleteScopeEndpoint.route]: handleDeleteScope,
    [forkDescriptorScopeEndpoint.route]: handleForkDescriptorScope,
    [removeDescriptorScopeEndpoint.route]: handleRemoveDescriptorScope,
    [configSnapshotEndpoint.route]: handleConfigSnapshot,
  },
  // Blocking: the config registry must be built before resources resolve, so
  // config-driven loaders don't briefly serve empty during a hot-swap.
  // `initRegistry` opens its own gate in a `finally`, so a partial failure
  // surfaces loudly per-path rather than hanging.
  async onReadyBlocking() {
    await initRegistry();
  },
  // Background: the file watcher only needs to catch later edits.
  async onReady() {
    await initConfigWatcher();
  },
  async onShutdown() {
    shutdownRegistry();
    await shutdownConfigWatcher();
  },
} satisfies ServerPluginDefinition;
