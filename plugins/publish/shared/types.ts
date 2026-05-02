export interface PluginNode {
  /** Path relative to plugins/, e.g. "active-data/plugins/conv". */
  path: string;
  /** Last-segment leaf name, e.g. "conv". */
  name: string;
  /** Dotted hierarchy id, e.g. "active-data.conv". */
  hierarchyId: string;
  description?: string;
  loadBearing: boolean;
  runtimes: { web: boolean; server: boolean; central: boolean };
  children: PluginNode[];
}

export interface PublishTreePayload {
  plugins: PluginNode[];
  totals: {
    plugins: number;
    loadBearing: number;
    umbrellas: number;
  };
}
