import { useCallback, type ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { Rank, computeFlatReorder } from "@plugins/primitives/plugins/rank/core";
import { RankReorderDndContext } from "./rank-reorder-dnd-context";

/** One reorderable item: a stable id, its sort `Rank`, and an optional
 *  section/group key. A cross-group drop reports the destination group via
 *  `onMove`'s `dest.group`. */
export interface RankReorderItem {
  id: string;
  rank: Rank;
  /** Section key; `null`/omitted = the single implicit group. */
  group?: string | null;
}

export interface RankReorderProviderProps {
  /** All draggable items, in any order. The provider groups by `group` and
   *  orders each group by rank to compute drop destinations. */
  items: readonly RankReorderItem[];
  /**
   * Persist a reorder. `dest.group` is the destination section (the drop
   * target's group); equal to the dragged item's group for an in-section move,
   * different for a cross-section move. `dest.targetId` / `dest.zone` are the
   * drop neighbor's id + side, surfaced so neighbor-based (endpoint) consumers
   * can persist by neighbor instead of by `rank`. No-op drops (same position)
   * are filtered out before this fires.
   */
  onMove: (
    id: string,
    dest: {
      rank: Rank;
      group: string | null;
      targetId: string;
      zone: "before" | "after";
    },
  ) => void | Promise<void>;
  /** Floating drag-chip content for the active id. */
  dragOverlay?: (id: string) => ReactNode;
  /** Re-measure droppables every frame (windowed lists). */
  measuringAlways?: boolean;
  /** Children. A render-prop receives the active drag id, which a windowed
   *  consumer forwards as `keepMounted` so the drag source stays in the DOM when
   *  it scrolls out of the window; a plain node ignores it. */
  children: ReactNode | ((activeId: string | null) => ReactNode);
}

/**
 * High-level flat rank-reorder host: wraps `RankReorderDndContext` and resolves
 * each before/after drop to a destination `Rank` via `computeFlatReorder`,
 * scoped to the drop target's group (so manual order composes with group-by
 * sections — a drag within a section reorders inside it; a drag onto another
 * section's row reseats into that section and reports its key). Per-row drag
 * affordances come from `useRankReorderItem`.
 */
export function RankReorderProvider({
  items,
  onMove,
  dragOverlay,
  measuringAlways,
  children,
}: RankReorderProviderProps) {
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const draggedId = active.data.current?.id as string | undefined;
      const zone = over.data.current?.zone as "before" | "after" | undefined;
      const targetId = over.data.current?.targetId as string | undefined;
      if (!draggedId || !zone || !targetId) return;
      if (draggedId === targetId) return;

      const target = items.find((i) => i.id === targetId);
      const dragged = items.find((i) => i.id === draggedId);
      const group = target?.group ?? null;
      // Resolve the rank WITHIN the target's group (in-section ordering).
      const scope = items.filter((i) => (i.group ?? null) === group);
      const rank = computeFlatReorder(scope, draggedId, zone, targetId);
      if (rank === null) return;
      // No-op guard: same group AND identical rank → nothing changed.
      if (
        dragged &&
        (dragged.group ?? null) === group &&
        Rank.equals(dragged.rank, rank)
      ) {
        return;
      }
      void onMove(draggedId, { rank, group, targetId, zone });
    },
    [items, onMove],
  );

  return (
    <RankReorderDndContext
      onDragEnd={onDragEnd}
      dragOverlay={dragOverlay}
      measuringAlways={measuringAlways}
    >
      {children}
    </RankReorderDndContext>
  );
}
