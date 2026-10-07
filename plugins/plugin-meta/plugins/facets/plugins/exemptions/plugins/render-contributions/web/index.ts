import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/plugin-meta/plugins/contributions-table/web";
import { exemptionsFacetTable } from "./exemptions-facet-table";

export default {
  description: "Aggregated exemptions table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(exemptionsFacetTable)],
} satisfies PluginDefinition;
