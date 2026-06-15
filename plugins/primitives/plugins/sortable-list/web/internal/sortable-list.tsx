import { useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  type SortingStrategy,
} from "@dnd-kit/sortable";

export interface SortableListProps {
  items: string[];
  onMove: (activeId: string, overId: string, event: DragEndEvent) => void;
  overlay?: (activeId: string) => ReactNode;
  disabled?: boolean;
  collisionDetection?: CollisionDetection;
  orientation?: "horizontal" | "vertical";
  /**
   * Explicit dnd-kit sorting strategy. When omitted, falls back to the
   * `orientation` mapping (horizontal/vertical list strategy). An explicit
   * strategy (e.g. `rectSortingStrategy` for 2-D wrap layouts) wins.
   */
  strategy?: SortingStrategy;
  /**
   * Opt-in "tear-off" gesture (default undefined → zero behavior change). When
   * provided, a drag that releases *beyond the list's cross-axis extent* (past a
   * margin below a horizontal strip, or beside a vertical one) fires `onDragOut`
   * with the released item id and the drop point, INSTEAD of `onMove`. Used by
   * the app tab bar to tear a chip into a floating window, Chrome-style.
   */
  onDragOut?: (id: string, point: { x: number; y: number }) => void;
  children: ReactNode;
}

/** Cross-axis margin (px) a release must clear past the strip to count as a tear-off. */
const TEAR_OFF_MARGIN = 24;

export function SortableList({
  items,
  onMove,
  overlay,
  disabled,
  collisionDetection,
  orientation,
  strategy,
  onDragOut,
  children,
}: SortableListProps) {
  const resolvedStrategy =
    strategy ??
    (orientation === "horizontal"
      ? horizontalListSortingStrategy
      : verticalListSortingStrategy);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticItems, setOptimisticItems] = useState<string[] | null>(null);

  // Clear optimistic state when canonical items update (server roundtrip complete)
  const prevItemsRef = useRef(items);
  if (prevItemsRef.current !== items) {
    prevItemsRef.current = items;
    if (optimisticItems) setOptimisticItems(null);
  }

  const effectiveItems = optimisticItems ?? items;

  return (
    <DndContext
      sensors={disabled ? [] : sensors}
      collisionDetection={collisionDetection ?? closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={(e: DragEndEvent) => {
        setActiveId(null);
        // Tear-off check (opt-in): if the dragged box was released beyond the
        // strip's cross-axis extent by a margin, fire onDragOut and skip the
        // reorder entirely. `initial` is the strip-aligned start box; `translated`
        // is the live dragged box at release.
        if (onDragOut) {
          const initial = e.active.rect.current.initial;
          const dragged = e.active.rect.current.translated;
          if (initial && dragged) {
            const horizontal = orientation === "horizontal";
            const draggedCenter = horizontal
              ? dragged.top + dragged.height / 2
              : dragged.left + dragged.width / 2;
            const lo = horizontal ? initial.top : initial.left;
            const hi = horizontal
              ? initial.top + initial.height
              : initial.left + initial.width;
            if (
              draggedCenter > hi + TEAR_OFF_MARGIN ||
              draggedCenter < lo - TEAR_OFF_MARGIN
            ) {
              onDragOut(String(e.active.id), {
                x: dragged.left + dragged.width / 2,
                y: dragged.top + dragged.height / 2,
              });
              return;
            }
          }
        }
        if (e.over && String(e.active.id) !== String(e.over.id)) {
          const oldIdx = effectiveItems.indexOf(String(e.active.id));
          const overIdx = effectiveItems.indexOf(String(e.over.id));
          if (oldIdx >= 0 && overIdx >= 0) {
            setOptimisticItems(arrayMove(effectiveItems, oldIdx, overIdx));
          }
          onMove(String(e.active.id), String(e.over.id), e);
        }
      }}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={effectiveItems} strategy={resolvedStrategy}>
        {children}
      </SortableContext>
      {overlay && (
        <DragOverlayWrapper activeId={activeId} overlay={overlay} />
      )}
    </DndContext>
  );
}

import { DragOverlay } from "@dnd-kit/core";

function DragOverlayWrapper({
  activeId,
  overlay,
}: {
  activeId: string | null;
  overlay: (activeId: string) => ReactNode;
}) {
  return (
    <DragOverlay dropAnimation={null}>
      {activeId ? overlay(activeId) : null}
    </DragOverlay>
  );
}
