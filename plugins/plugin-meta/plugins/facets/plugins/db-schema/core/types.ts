import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

export interface TableDef {
  name: string;
  varName: string;
}

export interface EntityExtension {
  parentPlugin: PluginId;
  extName: string;
  tableName: string;
}

export interface EntityExtensionRef {
  childPlugin: PluginId;
  extName: string;
  tableName: string;
}

export interface DbSchemaFacetData {
  dbFiles: string[];
  tables: TableDef[];
  entityExtensions: EntityExtension[];
  extendedBy: EntityExtensionRef[];
}

export const dbSchemaFacetDef = defineFacet<DbSchemaFacetData>("db-schema");
