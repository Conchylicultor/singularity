import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { structureFacetTable } from "./structure-facet-table";

export default {
  name: "Structure: Catalog Table",
  description:
    "Aggregated cross-plugin structure-anomaly table in the Forge catalog.",
  contributions: [Catalog.FacetTable(structureFacetTable)],
} satisfies PluginDefinition;
