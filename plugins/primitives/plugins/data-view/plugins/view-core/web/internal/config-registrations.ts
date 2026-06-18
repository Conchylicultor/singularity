import { ConfigV2 } from "@plugins/config_v2/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";

/**
 * One `ConfigV2.WebRegister` contribution per surface id, each planted under its
 * OWN defining plugin (the consumer owns the plugin identity per entry —
 * view-core is a generic engine). Each entry carries the `pluginId` so the
 * config file lands in the consuming plugin's tree
 * (`config/<asPath(pluginId)>/<id>.jsonc`). The descriptor instances come from
 * the caller's `buildViewDescriptors` map — the SAME objects `useViewsConfig`
 * looks up for `useConfig`/`useSetConfig` (reference identity).
 */
export function buildViewConfigContributions(
  entries: Array<{
    id: string;
    descriptor: ConfigDescriptor;
    pluginId: PluginId;
  }>,
): Contribution[] {
  return entries.map((e) =>
    ConfigV2.WebRegister({ descriptor: e.descriptor, pluginId: e.pluginId }),
  );
}
