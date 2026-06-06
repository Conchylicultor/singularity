import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { resourcesFacetTable } from "./resources-facet-table";

export default {
  name: "Resources: Catalog Table",
  description: "Aggregated cross-plugin resources table in the Forge catalog.",
  contributions: [Catalog.FacetTable(resourcesFacetTable)],
} satisfies PluginDefinition;
