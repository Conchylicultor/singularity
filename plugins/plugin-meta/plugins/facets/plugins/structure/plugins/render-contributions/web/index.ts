import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/apps/plugins/studio/plugins/contributions/web";
import { structureFacetTable } from "./structure-facet-table";

export default {
  name: "Structure: Contributions Table",
  description:
    "Aggregated cross-plugin structure-anomaly table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(structureFacetTable)],
} satisfies PluginDefinition;
