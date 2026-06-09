import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Contributions } from "@plugins/apps/plugins/studio/plugins/contributions/web";
import { registrationsFacetTable } from "./registrations-facet-table";

export default {
  description: "Aggregated cross-plugin registrations table in the Studio Contributions view.",
  contributions: [Contributions.FacetTable(registrationsFacetTable)],
} satisfies PluginDefinition;
