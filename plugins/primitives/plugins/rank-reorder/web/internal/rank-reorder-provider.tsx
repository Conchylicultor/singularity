import { useCallback, useMemo, type ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { Rank, computeFlatReorder } from "@plugins/primitives/plugins/rank/core";
import { RankReorderDndContext } from "./rank-reorder-dnd-context";
import {
  NO_DRAG_SCOPE,
  RankReorderDragScopeContext,
  type RankReorderDragScope,
} from "./drag-scope";

/** One reorderable item: a stable id, its sort `Rank`, and an optional
 *  section/group key. A drop onto another group's row is a *reseat*, reported
 *  through `onReseat` — and only offered when the host supplies it. */
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
   * Persist a reorder **within one group**. `dest.group` is that group (the drop
   * target's, which equals the dragged item's on this path). `dest.targetId` /
   * `dest.zone` are the drop neighbor's id + side, surfaced so neighbor-based
   * (endpoint) consumers can persist by neighbor instead of by `rank`. No-op
   * drops (same position) are filtered out before this fires.
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
  /**
   * Persist a **cross-group** move — the destination group plus the drop
   * neighbour. Anchor-only: the primitive does not mint a rank in a group whose
   * membership the host is about to change.
   *
   * Its **presence is the capability**: absent, a drag scopes itself to its own
   * group (every other group's rows disable their drop zones, so the refusal is
   * visible during the gesture rather than a silent no-op at drop time).
   */
  onReseat?: (
    id: string,
    dest: {
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
 * sections — a drag within a section reorders inside it). Per-row drag
 * affordances come from `useRankReorderItem`.
 *
 * Cross-group drops are a **separate capability**: with `onReseat` they route
 * there (a group write plus a reorder is the host's business, not the
 * primitive's); without it the provider publishes a scoped drag through
 * `RankReorderDragScopeContext` and the other groups' rows switch their drop
 * zones off for the duration of the gesture.
 */
export function RankReorderProvider({
  items,
  onMove,
  onReseat,
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

      if (dragged && (dragged.group ?? null) !== group) {
        // The destination is another group, so the move is a membership write
        // plus a reorder — nothing the primitive can mint a rank for.
        if (!onReseat) {
          // Unreachable: without `onReseat` the scope context disables every
          // other group's droppables, so no cross-group `over` can exist. Loud
          // rather than silent, because reaching it means a consumer passed
          // grouped `items` but withheld the group from `useRankReorderItem`.
          throw new Error(
            `rank-reorder: cross-group drop with no onReseat (${draggedId} → group ${String(group)}). Pass each row's group to useRankReorderItem.`,
          );
        }
        void onReseat(draggedId, { group, targetId, zone });
        return;
      }

      // Resolve the rank WITHIN the target's group (in-section ordering).
      const scope = items.filter((i) => (i.group ?? null) === group);
      const rank = computeFlatReorder(scope, draggedId, zone, targetId);
      if (rank === null) return;
      // No-op guard: the group is unchanged on this path, so an identical rank
      // means nothing moved.
      if (dragged && Rank.equals(dragged.rank, rank)) return;
      void onMove(draggedId, { rank, group, targetId, zone });
    },
    [items, onMove, onReseat],
  );

  return (
    <RankReorderDndContext
      onDragEnd={onDragEnd}
      dragOverlay={dragOverlay}
      measuringAlways={measuringAlways}
    >
      {(activeId) => (
        <DragScopeHost
          items={items}
          activeId={activeId}
          crossGroup={onReseat != null}
        >
          {typeof children === "function" ? children(activeId) : children}
        </DragScopeHost>
      )}
    </RankReorderDndContext>
  );
}

/**
 * Publishes the in-flight drag's group so each row can decide whether it is a
 * legal drop target. A separate component because the active id only exists
 * inside the shell's render-prop, and the context value must be memoized.
 */
function DragScopeHost({
  items,
  activeId,
  crossGroup,
  children,
}: {
  items: readonly RankReorderItem[];
  activeId: string | null;
  crossGroup: boolean;
  children: ReactNode;
}) {
  const value = useMemo<RankReorderDragScope>(() => {
    if (activeId === null || crossGroup) return NO_DRAG_SCOPE;
    return {
      activeGroup: items.find((i) => i.id === activeId)?.group ?? null,
      scoped: true,
    };
  }, [items, activeId, crossGroup]);
  return (
    <RankReorderDragScopeContext.Provider value={value}>
      {children}
    </RankReorderDragScopeContext.Provider>
  );
}
