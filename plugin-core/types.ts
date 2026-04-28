export type PluginId = string;

export type Contribution = {
  _slotId: string;
  /** Injected by PluginProvider from the enclosing PluginDefinition. */
  _pluginId?: PluginId;
  _pluginName?: string;
  _pluginDescription?: string;
  [key: string]: unknown;
};

export interface PluginDefinition {
  id: PluginId;
  name: string;
  description: string;
  /**
   * Marks the plugin as critical core infrastructure. Load-bearing plugins
   * appear with full detail in `docs/plugins-compact.md` (always-loaded by
   * agents); other plugins appear only as a name + one-liner.
   */
  loadBearing?: boolean;
  contributions?: Contribution[];
}
