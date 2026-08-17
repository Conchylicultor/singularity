export {
  recordCreatedSlot,
  getCreatedSlots,
  isSlot,
  collectSlots,
  declaredSlotSources,
  declarePluginSlots,
  subscribeSlotsDeclared,
  findUndeclaredSlots,
} from "./declaration";
export type {
  SlotMeta,
  SlotHandle,
  SlotSource,
  SlotDeclaringPlugin,
  SlotDeclarationListener,
} from "./declaration";
