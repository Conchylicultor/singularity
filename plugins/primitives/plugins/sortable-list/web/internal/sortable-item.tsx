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
  className?: string;
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

  const wrapperProps = handle ? {} : { ...attributes, ...listeners };

  const state: SortableItemState = {
    isDragging,
    ...(handle ? { handleProps: { ...attributes, ...listeners } } : {}),
  };

  return (
    <div ref={setNodeRef} style={style} className={className} {...wrapperProps}>
      {children(state)}
    </div>
  );
}
