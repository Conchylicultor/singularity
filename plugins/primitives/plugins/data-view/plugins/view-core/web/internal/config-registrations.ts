import { ConfigV2 } from "@plugins/config_v2/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";

/**
 * One `ConfigV2.WebRegister` contribution per surface id, all planted under the
 * caller-supplied plugin (the consumer owns the plugin identity — view-core is a
 * generic engine). The descriptor instances come from the caller's
 * `buildViewDescriptors` map — the SAME objects `useViewsConfig` looks up for
 * `useConfig`/`useSetConfig` (reference identity).
 */
export function buildViewConfigContributions(
  entries: Array<{ id: string; descriptor: ConfigDescriptor }>,
  pluginId: PluginId,
): Contribution[] {
  return entries.map((e) =>
    ConfigV2.WebRegister({ descriptor: e.descriptor, pluginId }),
  );
}
