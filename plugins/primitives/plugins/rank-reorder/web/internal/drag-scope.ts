import { createContext, useContext } from "react";

/**
 * What a row needs to know about the drag in flight in order to decide whether
 * it is a legal drop target. Published by `RankReorderProvider`, read by
 * `useRankReorderItem`.
 *
 * `scoped` is the whole cross-group refusal mechanism: it is true only while a
 * drag is in flight AND the host declared no cross-group capability, so a row in
 * another group disables its droppables — it leaves collision detection, paints
 * no indicator, and cannot be dropped on. The refusal is therefore *visible*
 * mid-gesture instead of being a silent no-op at drop time.
 */
export interface RankReorderDragScope {
  /** Group of the item being dragged; `null` when ungrouped (or no drag). */
  activeGroup: string | null;
  /** True while a drag is in flight and cross-group drops are NOT allowed. */
  scoped: boolean;
}

/**
 * The default every consumer outside a `RankReorderProvider` sees — notably the
 * tree, which mounts `RankReorderDndContext` directly (one DnD context per
 * section, so cross-section drags are already unrepresentable) and publishes no
 * scope. Never scoped ⇒ `useRankReorderItem` behaves exactly as before.
 */
export const NO_DRAG_SCOPE: RankReorderDragScope = {
  activeGroup: null,
  scoped: false,
};

export const RankReorderDragScopeContext =
  createContext<RankReorderDragScope>(NO_DRAG_SCOPE);

export function useRankReorderDragScope(): RankReorderDragScope {
  return useContext(RankReorderDragScopeContext);
}
