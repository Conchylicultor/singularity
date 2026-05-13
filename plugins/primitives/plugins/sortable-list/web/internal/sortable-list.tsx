import { useState, type ReactNode } from "react";
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
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

export interface SortableListProps {
  items: string[];
  onMove: (activeId: string, overId: string, event: DragEndEvent) => void;
  overlay?: (activeId: string) => ReactNode;
  disabled?: boolean;
  collisionDetection?: CollisionDetection;
  children: ReactNode;
}

export function SortableList({
  items,
  onMove,
  overlay,
  disabled,
  collisionDetection,
  children,
}: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <DndContext
      sensors={disabled ? [] : sensors}
      collisionDetection={collisionDetection ?? closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={(e: DragEndEvent) => {
        setActiveId(null);
        if (e.over && String(e.active.id) !== String(e.over.id)) {
          onMove(String(e.active.id), String(e.over.id), e);
        }
      }}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
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
    <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
      {activeId ? overlay(activeId) : null}
    </DragOverlay>
  );
}
