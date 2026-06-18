import { buildViewConfigContributions } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import { dataViewDescriptorEntries } from "./descriptors";

/**
 * One `ConfigV2.WebRegister` contribution per DataView id, each planted under its
 * OWN defining plugin (the consuming plugin's tree), so the config lands at
 * `config/<asPath(pluginId)>/<id>.jsonc`. The generic engine (view-core) builds
 * the contributions; data-view supplies its own descriptor entries (each
 * carrying its `pluginId` from the manifest). The descriptor instances are the
 * SAME objects `useViewModel` looks up for `useConfig`/`useSetConfig` (reference
 * identity).
 *
 * Built here (not in the barrel) so `web/index.ts` stays loop-free per the
 * barrel-purity rule.
 */
export const dataViewConfigContributions = buildViewConfigContributions(
  dataViewDescriptorEntries,
);
