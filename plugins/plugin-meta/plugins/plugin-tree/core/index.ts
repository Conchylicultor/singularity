export { buildPluginTree, enrichPluginTreeDocs, readIfExists, stripTypes, matchBracket, parseDefineGroup, parseResources } from "./internal/plugin-tree";
export type {
  Runtime,
  BarrelExport,
  SlotDef,
  CommandDef,
  ResourceDef,
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
