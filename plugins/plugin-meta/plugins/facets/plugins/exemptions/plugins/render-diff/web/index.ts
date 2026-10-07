import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import {
  exemptionsToComparable,
  type ExemptionsData,
} from "@plugins/plugin-meta/plugins/facets/plugins/exemptions/core";

export default {
  description: "Diff renderer for the exemptions facet (PR review).",
  contributions: [
    PluginChangesSlots.DiffRenderer({
      facetId: "exemptions",
      label: "Exempts itself from",
      toComparable: (data) => exemptionsToComparable(data as ExemptionsData),
    }),
  ],
} satisfies PluginDefinition;
