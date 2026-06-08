import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ContributionsFacetTable } from "./facet-table";

export const Contributions = {
  /**
   * Per-facet aggregated cross-plugin table — the Contributions view's sole contribution slot.
   * Each facet contributes one declarative table; the Contributions host iterates
   * contributions generically (facet-blind), slicing `node.facets[facetId]` for
   * every plugin. Interactive tabs set `onRowClick` to open a detail pane.
   */
  FacetTable: defineSlot<ContributionsFacetTable>("contributions.facet-table", {
    docLabel: (t) => t.label,
  }),
};
