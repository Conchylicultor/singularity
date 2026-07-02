import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/plugin-meta/plugins/contributions-table/web";
import { dbSchemaFacetTable } from "./db-schema-facet-table";

export default {
  description: "Aggregated cross-plugin tables table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(dbSchemaFacetTable)],
} satisfies PluginDefinition;
