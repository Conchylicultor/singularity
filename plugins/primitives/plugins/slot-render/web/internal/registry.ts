import type { SlotItemMiddleware, SlotListMiddleware } from "./types";

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
