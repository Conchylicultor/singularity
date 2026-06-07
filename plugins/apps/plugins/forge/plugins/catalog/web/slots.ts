import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { CatalogFacetTable } from "./facet-table";

export const Catalog = {
  /**
   * Per-facet aggregated cross-plugin table — the catalog's sole contribution slot.
   * Each facet contributes one declarative table; the catalog host iterates
   * contributions generically (facet-blind), slicing `node.facets[facetId]` for
   * every plugin. Interactive tabs set `onRowClick` to open a detail pane.
   */
  FacetTable: defineSlot<CatalogFacetTable>("catalog.facet-table", {
    docLabel: (t) => t.label,
  }),
};
