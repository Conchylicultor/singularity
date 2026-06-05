import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  crossRefsToComparable,
  type CrossRefsData,
} from "@plugins/plugin-meta/plugins/facets/plugins/cross-refs/core";

export default {
  name: "Cross-refs: Diff Renderer",
  description: "Diff renderer for the cross-refs facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "cross-refs",
      label: "Uses",
      toComparable: (data) => crossRefsToComparable(data as CrossRefsData),
    }),
  ],
} satisfies PluginDefinition;
