export {
  buildEnrichedTree,
  buildPluginTree,
  collectAllPlugins,
  generatePluginDocs,
  pluginClaudeMdPath,
  pluginCompactDocPath,
  pluginDetailsDocPath,
  renderCompactDoc,
  renderDetailsDoc,
  renderPluginClaudeMd,
  type GenerateDocsOptions,
  type PluginNode,
  type PluginTree,
} from "./docgen";

export {
  collectedDirRegistryPath,
  discoverCollectedDirs,
  generatePluginRegistry,
  renderCollectedDirRegistry,
  standardPluginDirs,
  type DiscoveredCollectedDir,
} from "./plugin-registry-gen";

export { defineCollectedDir, isCollectedDirDef, type CollectedDirDef } from "./collected-dir";

export {
  generateConfigOrigins,
  propagateConfigToUser,
  renderConfigOriginContent,
  resolveOriginAnnotations,
  setDefaultOriginAnnotations,
  setDefaultOriginAnnotationsPreparer,
  type OriginAnnotationsProvider,
  type OriginAnnotationsPreparer,
} from "./config-origin-gen";

// Importing this module registers the reorder contribution catalog as the
// default origin-annotations preparer (side effect at load). Both the build
// step and the `config-origins-in-sync` check import this barrel, so both
// processes emit identical contribution-catalog comments in generated origins.
export {
  generateReorderableSlots,
  renderReorderableSlotsManifest,
  reorderableSlotsManifestPath,
  type ReorderableSlotEntry,
} from "./reorderable-slots-gen";

export {
  generateBarrelStubs,
  renderBarrelStubs,
  barrelStubsPath,
} from "./barrel-stubs-gen";
