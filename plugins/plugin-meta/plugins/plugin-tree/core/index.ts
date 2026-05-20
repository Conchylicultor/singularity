export { buildPluginTree, enrichPluginTreeDocs } from "./internal/plugin-tree";
export type {
  Runtime,
  BarrelExport,
  SlotDef,
  CommandDef,
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
export { defineFacet, getFacet, setFacet } from "./internal/facets";
export type { FacetDef } from "./internal/facets";
