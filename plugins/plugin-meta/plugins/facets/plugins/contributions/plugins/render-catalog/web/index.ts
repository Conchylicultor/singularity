import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { contributionsFacetTable } from "./contributions-facet-table";

export default {
  name: "Contributions: Catalog Table",
  description: "Aggregated cross-plugin contributions table in the Forge catalog.",
  contributions: [Catalog.FacetTable(contributionsFacetTable)],
} satisfies PluginDefinition;
