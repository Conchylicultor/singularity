import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { commandsFacetTable } from "./commands-facet-table";

export default {
  name: "Commands: Catalog Table",
  description: "Aggregated cross-plugin commands table in the Forge catalog.",
  contributions: [Catalog.FacetTable(commandsFacetTable)],
} satisfies PluginDefinition;
