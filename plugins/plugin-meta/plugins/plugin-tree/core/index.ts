export { buildPluginTree, enrichPluginTreeDocs, readIfExists, stripTypes, matchBracket, parseBarrelExports, parseDefineGroup, parseResources, walkFiles } from "./internal/plugin-tree";
export type {
  Runtime,
  BarrelExport,
  SlotDef,
  CommandDef,
  ResourceDef,
  RouteDef,
  Contribution,
  RuntimeDetail,
  EntityExtension,
  EntityExtensionRef,
  TableDef,
  DocMetaContribution,
  DocMetaRegistration,
  PluginNode,
  PluginTree,
} from "./internal/plugin-tree";
