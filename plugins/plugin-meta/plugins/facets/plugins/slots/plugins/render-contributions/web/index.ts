import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/apps/plugins/studio/plugins/contributions/web";
import { slotsFacetTable } from "./slots-facet-table";

export default {
  name: "Slots: Contributions Table",
  description: "Aggregated cross-plugin slots table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(slotsFacetTable)],
} satisfies PluginDefinition;
