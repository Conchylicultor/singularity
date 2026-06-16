import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";
import { useStagedValue } from "@plugins/config_v2/plugins/staging/web";
import { reorderPluginIdForSlot } from "./descriptors";

/**
 * Reorder-side adapter over the generic config_v2 staging store. The generic
 * staged value is the full config document (`{ items }` for a reorder slot); this
 * unwraps the single `items` field back into a `ReorderTree` for the middleware,
 * keyed by the slot's (pluginId, slotId) identity.
 *
 * Returns the staged tree when an everyone-default is staged for this slot, else
 * `undefined` (the user's effective config drives the slot).
 */
export function useStagedTree(slotId: string): ReorderTree | undefined {
  const value = useStagedValue(reorderPluginIdForSlot(slotId), slotId);
  return (value as { items?: ReorderTree } | undefined)?.items;
}
