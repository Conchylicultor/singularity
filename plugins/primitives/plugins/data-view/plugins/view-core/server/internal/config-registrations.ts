import { ConfigV2 } from "@plugins/config_v2/server";
import type { ServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { viewsDescriptor } from "../../shared";

/**
 * One `ConfigV2.Register` contribution per surface id, each planted under its OWN
 * defining plugin (the consumer owns the plugin identity per entry), so the
 * config lands in the consuming plugin's tree. Each descriptor is built once here
 * (server runtime) so the registry's reference-keyed lookups are stable. The
 * server's descriptor identity is independent of the web's (per the
 * views-descriptor doc).
 */
export function buildViewConfigRegistrations(
  entries: Array<{ id: string; pluginId: PluginId }>,
): ServerContribution[] {
  return entries.map((e) =>
    ConfigV2.Register({ descriptor: viewsDescriptor(e.id), pluginId: e.pluginId }),
  );
}
