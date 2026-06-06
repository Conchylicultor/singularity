import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  dbSchemaToComparable,
  type DbSchemaFacetData,
} from "@plugins/plugin-meta/plugins/facets/plugins/db-schema/core";

export default {
  name: "DB Schema: Diff Renderer",
  description: "Diff renderer for the db-schema facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "db-schema",
      label: "Tables",
      toComparable: (data) => dbSchemaToComparable(data as DbSchemaFacetData),
    }),
  ],
} satisfies PluginDefinition;
