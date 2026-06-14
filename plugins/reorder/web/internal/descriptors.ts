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

/** The defining plugin's dot-form id for a reorderable slot (for the stage endpoint). */
const reorderPluginIdBySlot: Map<string, string> = new Map(
  reorderableSlots.map((s) => [s.slotId, s.pluginId]),
);

/**
 * Look up the dot-form `pluginId` of the plugin that defines `slotId`. The
 * staging fork sends this so the server writes the override under the defining
 * plugin's `config/` directory. Returns `""` for an unknown slot (never thrown —
 * the caller only stages known reorderable slots).
 */
export function reorderPluginIdForSlot(slotId: string): string {
  return reorderPluginIdBySlot.get(slotId) ?? "";
}
