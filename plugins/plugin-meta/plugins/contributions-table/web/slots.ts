import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ContributionsFacetTable, ContributionsRowClick } from "./facet-table";

export const Contributions = {
  /**
   * Per-facet aggregated cross-plugin table — the Contributions view's sole contribution slot.
   * Each facet contributes one declarative table; the Contributions host iterates
   * contributions generically (facet-blind), slicing `node.facets[facetId]` for
   * every plugin.
   */
  FacetTable: defineSlot<ContributionsFacetTable>("contributions.facet-table", {
    docLabel: (t) => t.label,
  }),
  /**
   * Per-facet row-click drill-down, keyed by `facetId`. Contributed by the
   * app-side owner of the target pane so a facet renderer (meta) never imports an
   * app pane — decoupling "what a row shows" (FacetTable) from "what a click does".
   */
  RowClick: defineSlot<ContributionsRowClick>("contributions.row-click", {
    docLabel: (r) => r.facetId,
  }),
};
