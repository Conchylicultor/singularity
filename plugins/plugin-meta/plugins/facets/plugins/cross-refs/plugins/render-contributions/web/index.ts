import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/apps/plugins/studio/plugins/contributions/web";
import { crossRefsFacetTable } from "./cross-refs-facet-table";

export default {
  name: "Cross-refs: Contributions Table",
  description: "Aggregated cross-plugin cross-refs table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(crossRefsFacetTable)],
} satisfies PluginDefinition;
