import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { routesFacetTable } from "./routes-facet-table";

export default {
  name: "Routes: Catalog Table",
  description: "Aggregated cross-plugin routes table in the Forge catalog.",
  contributions: [Catalog.FacetTable(routesFacetTable)],
} satisfies PluginDefinition;
