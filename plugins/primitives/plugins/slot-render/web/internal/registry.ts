import type {
  SlotItemAttrsFn,
  SlotItemBox,
  SlotItemMiddleware,
  SlotListMiddleware,
} from "./types";

const itemMiddlewares: SlotItemMiddleware[] = [];
const listMiddlewares: SlotListMiddleware[] = [];

export function registerSlotItemMiddleware(m: SlotItemMiddleware): void {
  itemMiddlewares.push(m);
  itemMiddlewares.sort((a, b) => a.priority - b.priority);
}

export function registerSlotListMiddleware(m: SlotListMiddleware): void {
  listMiddlewares.push(m);
  listMiddlewares.sort((a, b) => a.priority - b.priority);
}

export function getSlotItemMiddlewares(): readonly SlotItemMiddleware[] {
  return itemMiddlewares;
}

export function getSlotListMiddlewares(): readonly SlotListMiddleware[] {
  return listMiddlewares;
}

const itemAttrsFns: SlotItemAttrsFn[] = [];

/**
 * Register DOM attributes to be stamped onto EVERY contribution's own box — the
 * one element a slot draws around each contribution.
 *
 * This is data, not an element, on purpose. A plugin that wants to describe
 * contributions (the element picker's lineage marker) used to do it by wrapping
 * them, which meant it landed wherever its wrapper happened to sit — and it sat
 * inside the cell the slot draws, so the slack between a small widget and the
 * edge of its cell described nothing. Attributes cannot be misplaced: there is
 * exactly one box per contribution and the slot owns it, so a describing plugin
 * has no placement to get right.
 */
export function registerSlotItemAttrs(fn: SlotItemAttrsFn): void {
  itemAttrsFns.push(fn);
}

/** The merged attributes for one contribution's box, or `null` when none. */
export function getSlotItemAttrs(
  box: SlotItemBox,
): Record<string, string | undefined> | null {
  const merged: Record<string, string | undefined> = {};
  let stamped = false;
  for (const fn of itemAttrsFns) {
    const attrs = fn(box);
    if (!attrs) continue;
    stamped = true;
    Object.assign(merged, attrs);
  }
  return stamped ? merged : null;
}
