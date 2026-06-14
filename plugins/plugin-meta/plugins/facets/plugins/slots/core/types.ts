import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface SlotDef {
  memberName: string;
  slotId: string;
  groupName: string;
  /**
   * Which slot factory defined this slot. `"render"` for `defineRenderSlot`,
   * `"dispatch"` for `defineDispatchSlot`, `"slot"` for `defineSlot`. Best-effort
   * for runtime-discovered slots (the static parse can't always tell them apart).
   */
  kind?: "render" | "dispatch" | "slot";
  /**
   * Only meaningful for render slots. `true` (the default) means the slot's
   * `.Render` applies the reorder list middleware (it is reorderable). `false`
   * means `defineRenderSlot(id, { reorder: false })` opted out. Read directly
   * off the slot object by the runtime walk (`defineRenderSlot` stores it), or
   * from the call-site options by the static text-parse fallback; defaults to
   * `true` when absent.
   */
  reorder?: boolean;
}

export const slotsFacetDef = defineFacet<SlotDef[]>("slots");
