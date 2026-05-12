import type {
  ReorderConfig,
  SlotItemMiddleware,
  SlotListMiddleware,
} from "./types";

const itemMiddlewares: SlotItemMiddleware[] = [];
const listMiddlewares: SlotListMiddleware[] = [];
const renderSlotConfigs = new Map<string, ReorderConfig<unknown>>();

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

export function registerRenderSlotConfig(
  slotId: string,
  config: ReorderConfig<unknown>,
): void {
  renderSlotConfigs.set(slotId, config);
}

export function getRenderSlotConfig(
  slotId: string,
): ReorderConfig<unknown> | undefined {
  return renderSlotConfigs.get(slotId);
}

export function isRenderSlot(slotId: string): boolean {
  return renderSlotConfigs.has(slotId);
}
