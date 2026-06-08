import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

/**
 * Auto-documentable metadata attached to contributions and registration tokens.
 * The `kind` is never stored here — it is always derived from structural
 * identity (`_slotId` for slot contributions, `_kind` for registrations).
 */
export interface DocMeta {
  /** Human-readable label for this specific contribution. */
  label?: string;
  /** Optional extra detail (description excerpt, path, etc.). */
  detail?: string;
}

export type Contribution = {
  _slotId: string;
  /**
   * Injected by PluginProvider from the enclosing plugin's `id` — the
   * dotted plugin id (e.g. `conversations.conversation-view`).
   */
  _pluginId?: PluginId;
  _pluginName?: string;
  _pluginDescription?: string;
  _doc?: DocMeta;
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
  /** Auto-set by the factory (e.g. "mcp-tool", "job"). Never manually specified. */
  readonly _kind?: string;
  _doc?: DocMeta;
}

/**
 * Authored plugin shape — exactly what a barrel default-exports. `id` is
 * deliberately absent: it is NOT hand-authored. The loader derives it from the
 * plugin's unique directory/hierarchy path (see {@link LoadedPlugin}), which
 * makes duplicate ids impossible by construction.
 */
export interface PluginDefinition {
  name: string;
  description: string;
  /**
   * Marks the plugin as critical core infrastructure. Load-bearing plugins
   * appear with full detail in `docs/plugins-compact.md` (always-loaded by
   * agents); other plugins appear only as a name + one-liner.
   */
  loadBearing?: boolean;
  collapsed?: boolean;
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

/**
 * A plugin as it exists at runtime: the authored shape plus the loader-injected
 * identity. `id` is the plugin's dotted plugin id (e.g.
 * `conversations.conversation-view.jsonl-viewer`), guaranteed unique because
 * directory paths cannot collide. All framework readers (topo sort,
 * register/contribution tagging) operate on this type, so `p.id` is always a
 * defined string with no optionality. `dependsOn` is narrowed to other loaded
 * plugins (it is resolved by the loader, never hand-authored).
 */
export type LoadedPlugin = Omit<PluginDefinition, "dependsOn"> & {
  id: PluginId;
  dependsOn?: LoadedPlugin[];
};
