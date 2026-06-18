import { ConfigV2 } from "@plugins/config_v2/web";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { dataViewDescriptorEntries } from "./descriptors";

/**
 * One `ConfigV2.WebRegister` contribution per DataView id, all planted under the
 * `primitives.data-view` plugin (unlike reorder, which plants each slot under
 * its DEFINING plugin — every DataView config lives under data-view here). The
 * descriptor instances come from the shared `descriptors` map — the SAME objects
 * `use-views-config.ts` looks up for `useConfig`/`useSetConfig` (reference
 * identity).
 *
 * Built here (not in the barrel) so `web/index.ts` stays loop-free per the
 * barrel-purity rule.
 */
const DATA_VIEW_PLUGIN_ID = asPluginId("primitives.data-view");

export const dataViewConfigContributions = dataViewDescriptorEntries.map((e) =>
  ConfigV2.WebRegister({ descriptor: e.descriptor, pluginId: DATA_VIEW_PLUGIN_ID }),
);
