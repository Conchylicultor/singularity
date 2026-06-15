import { defineFacet } from "@plugins/plugin-meta/plugins/facets/core";

export interface SlotDef {
  memberName: string;
  slotId: string;
  groupName: string;
  /**
   * Which slot factory defined this slot. `"render"` for `defineRenderSlot`,
   * `"mount"` for `defineMountSlot`, `"dispatch"` for `defineDispatchSlot`,
   * `"wrap"` for `defineWrapperSlot`, `"slot"` for `defineSlot`. Best-effort for
   * runtime-discovered slots (the static parse can't always tell them apart).
   * Reorderability derives from `kind`: `"render"` slots are always reorderable;
   * every other kind (including `"wrap"`) never is.
   */
  kind?: "render" | "mount" | "dispatch" | "wrap" | "slot";
  /**
   * Full plugin ids (e.g. `apps/story/pages-integration`) of every plugin that
   * contributes to this specific slot — a per-slot reverse index populated by
   * this facet's `relate()` from the contributions facet's extract data. Empty
   * until `relate()` runs; deduped and sorted.
   */
  contributors: string[];
}

export const slotsFacetDef = defineFacet<SlotDef[]>("slots");
