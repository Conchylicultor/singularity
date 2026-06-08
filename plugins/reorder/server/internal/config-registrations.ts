import { ConfigV2 } from "@plugins/config_v2/server";
import { reorderDirectiveDescriptor } from "../../shared/directive";
import { reorderableSlots } from "../../shared/reorderable-slots.generated";

/**
 * One `ConfigV2.Register` contribution per reorderable slot, planted under the
 * slot's DEFINING plugin via `pluginId`. Each descriptor is built once
 * here (server runtime) so the registry's reference-keyed lookups are stable.
 *
 * Built here (not in the barrel) so `server/index.ts` stays loop-free per the
 * barrel-purity rule.
 */
export const reorderConfigRegistrations = reorderableSlots.map((s) =>
  ConfigV2.Register({
    descriptor: reorderDirectiveDescriptor(s.slotId),
    pluginId: s.pluginId,
  }),
);
