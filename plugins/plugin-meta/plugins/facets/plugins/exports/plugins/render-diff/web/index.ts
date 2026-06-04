import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  exportsToComparable,
  type ExportsData,
} from "@plugins/plugin-meta/plugins/facets/plugins/exports/core";

export default {
  name: "Exports: Diff Renderer",
  description: "Diff renderer for the exports facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "exports",
      label: "Exports",
      toComparable: (data) => exportsToComparable(data as ExportsData),
    }),
  ],
} satisfies PluginDefinition;
