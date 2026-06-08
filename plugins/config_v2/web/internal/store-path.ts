import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";

/**
 * The plugin hierarchy a config descriptor is stored under — the explicit
 * `pluginId` override on the `WebRegister` contribution when present, else the
 * registering plugin's own loader-injected `_pluginId`. The override exists so a
 * plugin can plant a descriptor under ANOTHER plugin's config hierarchy (e.g.
 * reorder registering each slot's directive under the slot's defining plugin).
 *
 * THE single source of truth: `useConfig`, `useSetConfig`, and
 * `useConfigRegistrations` all route through here so the client's resource key
 * can never drift from the server's storePath (`${pluginId}/<name>.jsonc`,
 * registry.ts). A drift surfaces as a loud "no descriptor registered for
 * resource path" crash from the config-v2 resource loader.
 */
export function storePluginId(reg: Contribution): string | undefined {
  return (reg.pluginId as string | undefined) ?? reg._pluginId;
}

/** Full storePath for a registration, or null if it carries no plugin id. */
export function storePathOf(reg: Contribution): string | null {
  const id = storePluginId(reg);
  return id ? `${id}/${(reg.descriptor as ConfigDescriptor).name}.jsonc` : null;
}
