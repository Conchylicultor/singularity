import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/apps/plugins/studio/plugins/contributions/web";
import { dbSchemaFacetTable } from "./db-schema-facet-table";

export default {
  name: "DB Schema: Contributions Table",
  description: "Aggregated cross-plugin tables table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(dbSchemaFacetTable)],
} satisfies PluginDefinition;
