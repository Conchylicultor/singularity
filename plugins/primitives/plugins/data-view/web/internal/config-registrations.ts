import { buildViewConfigContributions } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { dataViewDescriptorEntries } from "./descriptors";

/**
 * One `ConfigV2.WebRegister` contribution per DataView id, all planted under the
 * `primitives.data-view` plugin (every DataView config lives under data-view).
 * The generic engine (view-core) builds the contributions; data-view supplies its
 * own descriptor entries + plugin id. The descriptor instances are the SAME
 * objects `useViewModel` looks up for `useConfig`/`useSetConfig` (reference
 * identity).
 *
 * Built here (not in the barrel) so `web/index.ts` stays loop-free per the
 * barrel-purity rule.
 */
const DATA_VIEW_PLUGIN_ID = asPluginId("primitives.data-view");

export const dataViewConfigContributions = buildViewConfigContributions(
  dataViewDescriptorEntries,
  DATA_VIEW_PLUGIN_ID,
);
