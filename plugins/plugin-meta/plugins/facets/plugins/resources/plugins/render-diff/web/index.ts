import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  resourcesToComparable,
  type ResourceFacetData,
} from "@plugins/plugin-meta/plugins/facets/plugins/resources/core";

export default {
  name: "Resources: Diff Renderer",
  description: "Diff renderer for the resources facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "resources",
      label: "Resources",
      toComparable: (data) => resourcesToComparable(data as ResourceFacetData),
    }),
  ],
} satisfies PluginDefinition;
