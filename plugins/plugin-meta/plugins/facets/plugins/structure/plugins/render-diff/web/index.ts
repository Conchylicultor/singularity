import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  structureToComparable,
  type StructureFacetData,
} from "@plugins/plugin-meta/plugins/facets/plugins/structure/core";

export default {
  name: "Structure: Diff Renderer",
  description: "Diff renderer for the structure facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "structure",
      label: "Structure",
      toComparable: (data) => structureToComparable(data as StructureFacetData),
    }),
  ],
} satisfies PluginDefinition;
