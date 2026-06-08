export interface PluginNode {
  /** Path relative to plugins/, e.g. "active-data/plugins/conv". */
  path: string;
  /** Last-segment leaf name, e.g. "conv". */
  name: string;
  /** Dotted hierarchy id, e.g. "active-data.conv". */
  hierarchyId: string;
  description?: string;
  loadBearing: boolean;
  collapsed: boolean;
  runtimes: { web: boolean; server: boolean; central: boolean };
  children: PluginNode[];
  /**
   * Per-facet extracted data, keyed by facet id (e.g. "exports", "routes").
   * The sole metadata surface: every consumer reads `node.facets[facetId]` via an
   * id carried by its own contribution (DiffRenderer/PluginView.Section/Catalog.FacetTable),
   * never a hardcoded literal. The tree endpoint always populates it.
   */
  facets: Record<string, unknown>;
  /**
   * Self-declared SPA/CLI bootstrap root (`package.json` `singularity.compositionRoot`),
   * exempt from structural conformance (no barrel / non-standard package name is fine).
   */
  compositionRoot: boolean;
  /**
   * The plugin's immediate sub-directories, each tagged whether it is a
   * recognized/standard plugin folder (runtime, collected-dir, or a fixed
   * structural folder like `core`/`shared`/`plugins`/`bin`/`scripts`).
   */
  folders: { name: string; standard: boolean }[];
  /**
   * Top-level `.ts`/`.tsx` files sitting directly in the plugin dir — source that
   * should normally live inside a runtime folder rather than at the plugin root.
   */
  looseFiles: string[];
}

export interface PluginTreePayload {
  plugins: PluginNode[];
  totals: {
    plugins: number;
    loadBearing: number;
    umbrellas: number;
  };
}
