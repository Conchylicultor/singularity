import { ConfigV2 } from "@plugins/config_v2/web";
import { reorderDescriptorEntries } from "./descriptors";

/**
 * One `ConfigV2.WebRegister` contribution per reorderable slot, each planted
 * under the slot's DEFINING plugin via `pluginId`. The descriptor
 * instances come from the shared `descriptors` map — the SAME objects the
 * middleware looks up for `useConfig`/`useSetConfig` (reference identity).
 *
 * Built here (not in the barrel) so `web/index.ts` stays loop-free per the
 * barrel-purity rule.
 */
export const reorderConfigContributions = reorderDescriptorEntries.map((e) =>
  ConfigV2.WebRegister({ descriptor: e.descriptor, pluginId: e.pluginId }),
);
