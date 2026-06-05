import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  contributionsToComparable,
  type ContributionsFacetData,
} from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";

export default {
  name: "Contributions: Diff Renderer",
  description: "Diff renderer for the contributions facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "contributions",
      label: "Contributions",
      toComparable: (data) => contributionsToComparable(data as ContributionsFacetData),
    }),
  ],
} satisfies PluginDefinition;
