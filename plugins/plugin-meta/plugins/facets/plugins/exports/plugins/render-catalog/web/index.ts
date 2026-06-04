import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { exportsFacetTable } from "./exports-facet-table";

export default {
  name: "Exports: Catalog Table",
  description: "Aggregated cross-plugin exports table in the Forge catalog.",
  contributions: [Catalog.FacetTable(exportsFacetTable)],
} satisfies PluginDefinition;
