import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { ServerContribution } from "@plugins/framework/plugins/server-core/core";
import { buildViewConfigRegistrations } from "@plugins/primitives/plugins/data-view/plugins/view-core/server";

/**
 * The server twin of the web `defineBoardConfig`: the `ConfigV2.Register` of a
 * board's `views` document under the declaring plugin, for its server barrel.
 */
export function boardConfigRegistrations(
  id: string,
  pluginId: PluginId,
): ServerContribution[] {
  return buildViewConfigRegistrations([{ id, pluginId }]);
}
