export type PluginId = string;

export type Contribution = {
  _slotId: string;
  /** Injected by PluginProvider from the enclosing PluginDefinition. */
  _pluginId?: PluginId;
  _pluginName?: string;
  _pluginDescription?: string;
  [key: string]: unknown;
};

/**
 * A lazy registry write. Returned by helpers like `Mcp.tool`, `Runtime.define`,
 * `defineJob`, `defineTriggerEvent`, and `UNSAFE_installDurableHooks`. The
 * framework walks `plugin.register: Registration[]` during the register phase
 * and invokes `.register()` on each token in topo-sorted order.
 *
 * Dual-purpose factories (`defineJob`, `defineTriggerEvent`'s `event` field)
 * implement Registration alongside their public API on the same object —
 * `const dispatchJob = defineJob({...})` exposes `.enqueue` (factory role)
 * and `.register()` (framework hook).
 */
export interface Registration {
  register(): void | Promise<void>;
}

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
  /**
   * Plugins this plugin's `register` array must run after. Mirror of the
   * server field with the same name; rarely needed on web because
   * contributions are pure declarative data.
   */
  dependsOn?: PluginDefinition[];
  /**
   * Lazy registry-write tokens applied by `PluginProvider` on mount, before
   * any `Core.Root` contribution renders. Sequential, topo-sorted. Sync-only
   * on web (the React mount path is synchronous). Most web plugins do not
   * need this — contributions are declarative data.
   */
  register?: Registration[];
}
