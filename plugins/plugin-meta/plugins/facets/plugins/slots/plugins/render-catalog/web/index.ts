import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { slotsFacetTable } from "./slots-facet-table";

export default {
  name: "Slots: Catalog Table",
  description: "Aggregated cross-plugin slots table in the Forge catalog.",
  contributions: [Catalog.FacetTable(slotsFacetTable)],
} satisfies PluginDefinition;
