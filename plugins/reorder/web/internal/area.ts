import type { Slot } from "@core";

export type ReorderConfig<P> = {
  /** Group accessor; returning the same string keeps items in the same group.
   *  null/undefined means "no grouping" — drag is unconstrained. */
  getGroup?: (item: P) => string | null;
  /** Label accessor for the restore popover when an item is hidden. */
  getLabel?: (item: P) => string;
};

declare const ReorderableTag: unique symbol;
export type ReorderableSlot<P> = Slot<P> & {
  readonly [ReorderableTag]: true;
};

const registry = new Map<string, ReorderConfig<unknown>>();

/** Slot owner: declare a slot reorderable. Adds `id: string` and
 *  `excludeFromReorder?: boolean` to the slot's prop type at compile time. */
export function area<P>(
  slot: Slot<P>,
  opts: ReorderConfig<P & { id: string }> = {},
): ReorderableSlot<P & { id: string; excludeFromReorder?: boolean }> {
  registry.set(slot.id, opts as ReorderConfig<unknown>);
  return slot as unknown as ReorderableSlot<
    P & { id: string; excludeFromReorder?: boolean }
  >;
}

export function lookupReorderConfig(
  slotId: string,
): ReorderConfig<unknown> | undefined {
  return registry.get(slotId);
}
