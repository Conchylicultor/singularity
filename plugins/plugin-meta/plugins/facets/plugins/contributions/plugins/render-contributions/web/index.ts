import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/apps/plugins/studio/plugins/contributions/web";
import { contributionsFacetTable } from "./contributions-facet-table";

export default {
  name: "Contributions: Contributions Table",
  description: "Aggregated cross-plugin contributions table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(contributionsFacetTable)],
} satisfies PluginDefinition;
