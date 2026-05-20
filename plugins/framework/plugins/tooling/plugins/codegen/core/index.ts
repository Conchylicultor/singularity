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
  generatePluginRegistry,
  pluginRegistryPath,
  renderPluginRegistry,
  type Runtime,
} from "./plugin-registry-gen";

export { generateConfigOrigins, renderConfigOriginContent } from "./config-origin-gen";
