import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface SortableItemState {
  isDragging: boolean;
  handleProps?: Record<string, unknown>;
}

export interface SortableItemProps {
  id: string;
  handle?: boolean;
  disabled?: boolean;
  className?: string | ((state: SortableItemState) => string);
  children: (state: SortableItemState) => ReactNode;
}

export function SortableItem({
  id,
  handle,
  disabled,
  className,
  children,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const wrapperProps = handle || !listeners ? {} : { ...attributes, ...listeners };

  const state: SortableItemState = {
    isDragging,
    ...(handle ? { handleProps: { ...attributes, ...listeners } } : {}),
  };

  const resolvedClassName =
    typeof className === "function" ? className(state) : className;

  return (
    <div ref={setNodeRef} style={style} className={resolvedClassName} {...wrapperProps}>
      {children(state)}
    </div>
  );
}
