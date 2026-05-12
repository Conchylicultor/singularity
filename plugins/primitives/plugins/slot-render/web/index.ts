import type { PluginDefinition } from "@core";

export { defineRenderSlot, RenderSlotSubIdContext } from "./internal/render-slot";
export type { RenderSlot, RenderSlotConfig } from "./internal/render-slot";
export type {
  ReorderConfig,
  SlotItemMiddleware,
  SlotListMiddleware,
} from "./internal/types";
export {
  registerSlotItemMiddleware,
  registerSlotListMiddleware,
  isRenderSlot,
  getRenderSlotConfig,
} from "./internal/registry";

export default {
  id: "slot-render",
  name: "Slot Render",
  description:
    "Typed rendering primitive for visual slots with auto-applied middleware (error boundaries, reorder).",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
