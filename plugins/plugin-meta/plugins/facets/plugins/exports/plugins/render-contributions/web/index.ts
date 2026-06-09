import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/apps/plugins/studio/plugins/contributions/web";
import { exportsFacetTable } from "./exports-facet-table";

export default {
  description: "Aggregated cross-plugin exports table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(exportsFacetTable)],
} satisfies PluginDefinition;
