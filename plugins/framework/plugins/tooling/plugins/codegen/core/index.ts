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

// defineCollectedDir / CollectedDirDef / isCollectedDirDef now live in the
// dependency-free leaf @plugins/framework/plugins/tooling/plugins/collected-dir/core
// (the runtimes import the marker from there without forming a cycle through
// plugin-tree/facets, which codegen depends on).

export {
  generateConfigOrigins,
  propagateConfigToUser,
  renderConfigOriginContent,
  loadConfigDescriptorsByOriginPath,
  resolveOriginAnnotations,
  setDefaultOriginAnnotations,
  setDefaultOriginAnnotationsPreparer,
  resolveOriginDefaults,
  setDefaultOriginDefaults,
  setDefaultOriginDefaultsPreparer,
  type OriginAnnotationsProvider,
  type OriginAnnotationsPreparer,
  type OriginDefaultsProvider,
  type OriginDefaultsPreparer,
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
  collectDataViews,
  generateDataViews,
  renderDataViewsManifest,
  dataViewsManifestPath,
} from "./data-views-gen";

export {
  generateBarrelStubs,
  renderBarrelStubs,
  barrelStubsPath,
} from "./barrel-stubs-gen";

export {
  collectTokenGroupVars,
  generateTokenGroupVars,
  renderTokenGroupVarsManifest,
  tokenGroupVarsManifestPath,
} from "./token-group-vars-gen";
