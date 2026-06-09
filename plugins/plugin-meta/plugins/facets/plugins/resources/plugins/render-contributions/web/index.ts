import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/apps/plugins/studio/plugins/contributions/web";
import { resourcesFacetTable } from "./resources-facet-table";

export default {
  description: "Aggregated cross-plugin resources table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(resourcesFacetTable)],
} satisfies PluginDefinition;
