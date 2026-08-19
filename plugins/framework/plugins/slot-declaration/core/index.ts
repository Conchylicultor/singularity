export {
  recordCreatedSlot,
  getCreatedSlots,
  isSlot,
  collectSlots,
  declaredSlotSources,
  declarePluginSlots,
  subscribeSlotsDeclared,
  slotDeclarationPasses,
  findUndeclaredSlots,
  seg,
  declaredSlotId,
} from "./declaration";
export type {
  SlotMeta,
  SlotHandle,
  SlotSource,
  SlotRecord,
  SlotDeclaration,
  SlotDeclaringPlugin,
  SlotDeclarationListener,
} from "./declaration";
