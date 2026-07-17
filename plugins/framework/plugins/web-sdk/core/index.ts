export { webCollectedDir } from "./collected-dir";
export { defineSlot, Core } from "./slots";
export type { Slot } from "./slots";
export { UNSAFE_unsealSlotComponent } from "./sealed-component";
export type { SealedComponent, SealContributions } from "./sealed-component";
export { PluginProvider, PluginRuntimeContext } from "./context";
export type { PluginDefinition, LoadedPlugin, Contribution, DocMeta } from "./types";
export { loadPlugins } from "./loader";
export type { PluginEntry, PluginLoadError } from "./loader";
export { partitionWebEntries, isDeferredPluginPath } from "./load-tiers";
export {
  useDeferredLoadState,
  getDeferredLoadState,
  subscribeDeferredLoadState,
  markDeferredPluginsLoaded,
  markDeferredLoadComplete,
  markDeferredPluginsFailed,
  hasLoadErrorUnder,
  useHasLoadErrorUnder,
  pluginLoadReportSink,
  resetDeferredLoadStateForTests,
} from "./deferred-load-store";
export type { DeferredLoadState, PluginLoadReport } from "./deferred-load-store";
