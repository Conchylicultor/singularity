import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/plugin-meta/plugins/contributions-table/web";
import { routesFacetTable } from "./routes-facet-table";

export default {
  description: "Aggregated cross-plugin routes table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(routesFacetTable)],
} satisfies PluginDefinition;
