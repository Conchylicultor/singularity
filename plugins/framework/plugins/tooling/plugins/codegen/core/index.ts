export {
  buildEnrichedTree,
  buildPluginTree,
  collectAllPlugins,
  generatePluginDocs,
  pluginClaudeMdPath,
  pluginCompactDocPath,
  pluginDetailsDocPath,
  pluginRoutesDocPath,
  renderCompactDoc,
  renderDetailsDoc,
  renderPluginClaudeMd,
  renderRoutesDoc,
  type GenerateDocsOptions,
  type PluginNode,
  type PluginTree,
} from "./docgen";

export {
  collectedDirRegistryPath,
  discoverCollectedDirs,
  generatePluginRegistry,
  renderCollectedDirRegistry,
  type DiscoveredCollectedDir,
} from "./plugin-registry-gen";

export { defineCollectedDir, isCollectedDirDef, type CollectedDirDef } from "./collected-dir";

export { generateConfigOrigins, renderConfigOriginContent } from "./config-origin-gen";

export {
  generateBarrelStubs,
  renderBarrelStubs,
  barrelStubsPath,
} from "./barrel-stubs-gen";
