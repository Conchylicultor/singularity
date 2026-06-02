import { defineDispatchSlot, type DispatchContribution } from "@plugins/primitives/plugins/slot-render/web";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import type { CatalogFacetTable } from "./facet-table";

/** Props received by each category's body component. */
export interface CatalogCategoryBodyProps {
  plugins: PluginNode[];
  filter: string;
  activeId: string;
}

/** Display metadata carried alongside the dispatch fields (match, component). */
export interface CatalogCategoryMeta {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  getCount: (plugins: PluginNode[]) => number;
}

/** Full contribution shape — display metadata plus dispatch fields. */
export type CatalogCategoryContribution =
  DispatchContribution<CatalogCategoryBodyProps, string> & CatalogCategoryMeta;

export const Catalog = {
  Category: defineDispatchSlot<
    CatalogCategoryBodyProps,
    string,
    CatalogCategoryMeta
  >("catalog.category", {
    key: (props) => props.activeId,
    docLabel: (c) => c.label,
  }),

  /**
   * Per-facet aggregated cross-plugin table. Each facet contributes one declarative
   * table; the catalog host iterates contributions generically (facet-blind), slicing
   * `node.facets[facetId]` for every plugin.
   */
  FacetTable: defineSlot<CatalogFacetTable>("catalog.facet-table", {
    docLabel: (t) => t.label,
  }),
};
