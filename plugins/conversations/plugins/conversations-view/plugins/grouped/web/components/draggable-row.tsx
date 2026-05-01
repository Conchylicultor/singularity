import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DropTarget =
  | { kind: "conv"; convId: string }
  | { kind: "group"; groupId: string }
  | { kind: "auto-group"; rootConvIds: string[]; title: string }
  | { kind: "new-group" }
  | { kind: "ungroup" };

// Wraps a sidebar conversation row to make the row itself draggable AND a drop
// target. The drag id is the conversation id; the drop id is namespaced so it
// never collides with group drop ids. `forks` are rendered as siblings of the
// draggable wrapper so they don't inflate the dragged element's bounding rect
// (which dnd-kit uses to size the DragOverlay).
export function DraggableRow({
  convId,
  groupId,
  row,
  forks,
}: {
  convId: string;
  // When this row is rendered inside a user-group box, dropping on it should
  // join that group regardless of the row's own grouping. Pass the enclosing
  // group id so the dispatcher can short-circuit the lookup.
  groupId?: string;
  row: ReactNode;
  forks?: ReactNode;
}) {
  const draggable = useDraggable({
    id: `conv-${convId}`,
    data: { kind: "drag-conv", convId } as const,
  });
  const droppable = useDroppable({
    id: `drop-conv-${convId}`,
    data:
      groupId !== undefined
        ? ({ kind: "group", groupId } as DropTarget)
        : ({ kind: "conv", convId } as DropTarget),
  });

  return (
    <li className="group/menu-item relative list-none">
      <div
        ref={(node) => {
          draggable.setNodeRef(node);
          droppable.setNodeRef(node);
        }}
        {...draggable.attributes}
        {...draggable.listeners}
        className={cn(
          "relative",
          draggable.isDragging && "opacity-40",
          droppable.isOver && "rounded-md ring-1 ring-primary/60",
        )}
      >
        {row}
      </div>
      {forks}
    </li>
  );
}
