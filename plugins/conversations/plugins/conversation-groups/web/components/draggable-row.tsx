import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DropTarget =
  | { kind: "conv"; convId: string }
  | { kind: "group"; groupId: string };

// Wraps a sidebar conversation row to make it draggable AND a drop target.
// The drag id is the conversation id; the drop id is namespaced so it never
// collides with group drop ids.
export function DraggableRow({
  convId,
  groupId,
  children,
}: {
  convId: string;
  // When this row is rendered inside a user-group box, dropping on it should
  // join that group regardless of the row's own grouping. Pass the enclosing
  // group id so the dispatcher can short-circuit the lookup.
  groupId?: string;
  children: ReactNode;
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

  // The conversation list lives inside shadcn SidebarMenu primitives, which
  // expect SidebarMenuItem as the direct child of the menu list. We use a
  // wrapping <li> so we don't break that contract while still mounting two
  // refs and propagating drag state.
  return (
    <li
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      {...draggable.attributes}
      {...draggable.listeners}
      className={cn(
        "group/menu-item relative list-none",
        draggable.isDragging && "opacity-40",
        droppable.isOver && "ring-1 ring-primary/60 rounded-md",
      )}
    >
      {children}
    </li>
  );
}
