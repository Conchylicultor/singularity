import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  routesToComparable,
  type RoutesData,
} from "@plugins/plugin-meta/plugins/facets/plugins/routes/core";

export default {
  name: "Routes: Diff Renderer",
  description: "Diff renderer for the routes facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "routes",
      label: "Routes",
      toComparable: (data) => routesToComparable(data as RoutesData),
    }),
  ],
} satisfies PluginDefinition;
