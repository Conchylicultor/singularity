export type PluginId = string;

export type Contribution = { _slotId: string; [key: string]: unknown };

export interface PluginDefinition {
  id: PluginId;
  name: string;
  contributions?: Contribution[];
}
