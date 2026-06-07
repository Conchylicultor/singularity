import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Catalog } from "@plugins/apps/plugins/forge/plugins/catalog/web";
import { registrationsFacetTable } from "./registrations-facet-table";

export default {
  name: "Registrations: Catalog Table",
  description: "Aggregated cross-plugin registrations table in the Forge catalog.",
  contributions: [Catalog.FacetTable(registrationsFacetTable)],
} satisfies PluginDefinition;
