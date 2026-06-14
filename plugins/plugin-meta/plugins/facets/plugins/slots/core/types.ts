import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface SlotDef {
  memberName: string;
  slotId: string;
  groupName: string;
  /**
   * Which slot factory defined this slot. `"render"` for `defineRenderSlot`,
   * `"mount"` for `defineMountSlot`, `"dispatch"` for `defineDispatchSlot`,
   * `"slot"` for `defineSlot`. Best-effort for runtime-discovered slots (the
   * static parse can't always tell them apart). Reorderability derives from
   * `kind`: `"render"` slots are always reorderable; `"mount"` never are.
   */
  kind?: "render" | "mount" | "dispatch" | "slot";
}

export const slotsFacetDef = defineFacet<SlotDef[]>("slots");
