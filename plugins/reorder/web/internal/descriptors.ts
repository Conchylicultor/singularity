import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { reorderDirectiveDescriptor } from "../../shared/directive";
import { reorderableSlots } from "../../shared/reorderable-slots.generated";

/**
 * The ONE descriptor instance per reorderable slot for the web runtime.
 *
 * `useConfig`/`useSetConfig` match a config registration by descriptor
 * *reference identity* (`reg.descriptor === descriptor`). So the descriptor
 * passed to `ConfigV2.WebRegister` in `web/index.ts` and the one looked up in
 * the middleware MUST be the same object. Centralizing the map here — imported
 * by both — guarantees that.
 */
export const reorderDescriptors: Map<string, ConfigDescriptor> = new Map(
  reorderableSlots.map((s) => [s.slotId, reorderDirectiveDescriptor(s.slotId)]),
);

/** All [slotId, descriptor] pairs, for registration in the web barrel. */
export const reorderDescriptorEntries: Array<{
  slotId: string;
  descriptor: ConfigDescriptor;
  pluginId: string;
}> = reorderableSlots.map((s) => ({
  slotId: s.slotId,
  descriptor: reorderDescriptors.get(s.slotId)!,
  pluginId: s.pluginId,
}));
