export { buildPluginTree, readIfExists, stripTypes, matchBracket, parseBarrelExports, parseDefineGroup, parseResources, walkFiles, parseStringField, parseBoolField } from "./internal/plugin-tree";
// Note: parseResources is re-exported from ./internal/plugin-tree which itself re-exports from resources/core
export type {
  BarrelExport,
  Runtime,
  SlotDef,
  CommandDef,
  ResourceDef,
  RouteDef,
  Contribution,
  ContributionsFacetData,
  RuntimeDetail,
  EntityExtension,
  EntityExtensionRef,
  TableDef,
  DocMetaContribution,
  DocMetaRegistration,
  PluginNode,
  PluginTree,
} from "./internal/plugin-tree";
