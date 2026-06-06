import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { dbSchemaFacetTable } from "./db-schema-facet-table";

export default {
  name: "DB Schema: Catalog Table",
  description: "Aggregated cross-plugin tables table in the Forge catalog.",
  contributions: [Catalog.FacetTable(dbSchemaFacetTable)],
} satisfies PluginDefinition;
