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
  contributions?: Contribution[];
}
