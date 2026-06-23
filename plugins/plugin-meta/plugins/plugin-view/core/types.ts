import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

export interface PluginNode {
  /** Path relative to plugins/, e.g. "active-data/plugins/conv". */
  path: string;
  /** Last-segment leaf name, e.g. "conv". */
  name: string;
  /** Dotted plugin id, e.g. "active-data.conv". */
  id: PluginId;
  description?: string;
  loadBearing: boolean;
  /** This plugin's own package.json `singularity.disabled` flag. */
  disabledSeed: boolean;
  /** This plugin is in the disabled closure (seed OR cascade). */
  disabled: boolean;
  collapsed: boolean;
  runtimes: { web: boolean; server: boolean; central: boolean };
  children: PluginNode[];
  /**
   * Per-facet extracted data, keyed by facet id (e.g. "exports", "routes").
   * The sole metadata surface: every consumer reads `node.facets[facetId]` via an
   * id carried by its own contribution (DiffRenderer/PluginView.Section/Contributions.FacetTable),
   * never a hardcoded literal. The tree endpoint always populates it.
   */
  facets: Record<string, unknown>;
}

export interface PluginTreePayload {
  plugins: PluginNode[];
  totals: {
    plugins: number;
    loadBearing: number;
    umbrellas: number;
  };
}
