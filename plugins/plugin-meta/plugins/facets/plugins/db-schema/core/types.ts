import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface TableDef {
  name: string;
  varName: string;
}

export interface EntityExtension {
  parentPlugin: string;
  extName: string;
  tableName: string;
}

export interface EntityExtensionRef {
  childPlugin: string;
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
