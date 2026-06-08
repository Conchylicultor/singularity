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

export { generateConfigOrigins, propagateConfigToUser, renderConfigOriginContent } from "./config-origin-gen";

export {
  generateBarrelStubs,
  renderBarrelStubs,
  barrelStubsPath,
} from "./barrel-stubs-gen";
