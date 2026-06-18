import { ConfigV2 } from "@plugins/config_v2/server";
import type { ServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { viewsDescriptor } from "../../shared";

/**
 * One `ConfigV2.Register` contribution per surface id, all planted under the
 * caller-supplied plugin (the consumer owns the plugin identity). Each
 * descriptor is built once here (server runtime) so the registry's
 * reference-keyed lookups are stable. The server's descriptor identity is
 * independent of the web's (per the views-descriptor doc).
 */
export function buildViewConfigRegistrations(
  ids: string[],
  pluginId: PluginId,
): ServerContribution[] {
  return ids.map((id) =>
    ConfigV2.Register({ descriptor: viewsDescriptor(id), pluginId }),
  );
}
