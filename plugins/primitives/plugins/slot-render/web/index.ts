import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  defineRenderSlot,
  defineMountSlot,
  defineDispatchSlot,
  renderIsolated,
  RenderSlotSubIdContext,
} from "./internal/render-slot";
export type {
  RenderSlot,
  RenderSlotConfig,
  MountSlot,
  MountComponent,
  MountSlotConfig,
  DispatchSlot,
  DispatchContribution,
  DispatchSlotConfig,
} from "./internal/render-slot";
export type {
  SlotItemMiddleware,
  SlotListMiddleware,
} from "./internal/types";
export {
  registerSlotItemMiddleware,
  registerSlotListMiddleware,
} from "./internal/registry";

export default {
  description:
    "Typed rendering primitive for visual slots with auto-applied middleware (error boundaries, reorder).",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
