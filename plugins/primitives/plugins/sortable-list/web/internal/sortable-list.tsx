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
} from "@dnd-kit/sortable";

export interface SortableListProps {
  items: string[];
  onMove: (activeId: string, overId: string, event: DragEndEvent) => void;
  overlay?: (activeId: string) => ReactNode;
  disabled?: boolean;
  collisionDetection?: CollisionDetection;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

export function SortableList({
  items,
  onMove,
  overlay,
  disabled,
  collisionDetection,
  orientation,
  children,
}: SortableListProps) {
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
      <SortableContext
        items={effectiveItems}
        strategy={
          orientation === "horizontal"
            ? horizontalListSortingStrategy
            : verticalListSortingStrategy
        }
      >
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
