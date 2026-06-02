import type { ComponentType } from "react";
import type { ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

/** One plugin's slice of a facet's data, paired with its node. */
export interface FacetTableEntry<T = unknown> {
  node: PluginNode;
  data: T;
}

/**
 * Declarative aggregated cross-plugin table for one facet. Contributed to the
 * `Catalog.FacetTable` slot. The catalog host slices `node.facets[facetId]` for
 * every plugin, builds entries, projects them to rows, and renders through the
 * data-table primitive — staying entirely facet-blind.
 */
export interface CatalogFacetTable<Row = unknown> {
  /** Facet id; host slices `node.facets[facetId]` for every plugin. */
  facetId: string;
  /** Tab label, e.g. "Routes", "Slots". */
  label: string;
  /** Tab icon for the catalog category strip. */
  icon: ComponentType<{ size?: number }>;
  /** Columns passed straight to the data-table primitive. */
  columns: ColumnDef<Row>[];
  /** Project the per-plugin facet entries into flat table rows. */
  rows: (entries: FacetTableEntry[]) => Row[];
  /** Stable, unique key per row (passed to data-table's `rowKey`). */
  rowKey: (row: Row) => string;
}

/**
 * Type-erasing factory. `columns`/`rows`/`rowKey` correlate over `Row`, but the
 * slot stores one homogeneous `CatalogFacetTable` (= `<unknown>`). Because `Row`
 * sits in contravariant positions, a concrete `CatalogFacetTable<RouteRow>` is NOT
 * assignable to `CatalogFacetTable<unknown>`. This factory type-checks authoring
 * against the concrete `Row`, then erases for storage in the slot.
 */
export function defineFacetTable<Row>(table: CatalogFacetTable<Row>): CatalogFacetTable {
  return table as CatalogFacetTable;
}
