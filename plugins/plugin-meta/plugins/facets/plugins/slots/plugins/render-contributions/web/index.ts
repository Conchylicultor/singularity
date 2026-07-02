import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/plugin-meta/plugins/contributions-table/web";
import { slotsFacetTable } from "./slots-facet-table";

export default {
  description: "Aggregated cross-plugin slots table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(slotsFacetTable)],
} satisfies PluginDefinition;
