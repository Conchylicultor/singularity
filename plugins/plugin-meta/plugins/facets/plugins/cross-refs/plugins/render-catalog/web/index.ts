import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { crossRefsFacetTable } from "./cross-refs-facet-table";

export default {
  name: "Cross-refs: Catalog Table",
  description: "Aggregated cross-plugin cross-refs table in the Forge catalog.",
  contributions: [Catalog.FacetTable(crossRefsFacetTable)],
} satisfies PluginDefinition;
