import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface SortableItemState {
  isDragging: boolean;
  /**
   * Spread onto the drag handle when `handle` is set. Carries the activator
   * `ref` too, so keyboard focus returns to the handle after a keyboard drag.
   */
  handleProps?: Record<string, unknown>;
}

export interface SortableItemProps {
  id: string;
  handle?: boolean;
  disabled?: boolean;
  className?: string | ((state: SortableItemState) => string);
  /** Extra attributes for the moving wrapper box (e.g. `data-*` test hooks). */
  wrapperProps?: Record<`data-${string}`, string | number>;
  children: (state: SortableItemState) => ReactNode;
}

export function SortableItem({
  id,
  handle,
  disabled,
  className,
  wrapperProps: extraWrapperProps,
  children,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style: CSSProperties = {
    // Translate, NEVER `CSS.Transform`: without a DragOverlay, dnd-kit scales the
    // dragged item's transform to the rect it is over (over / active size), so
    // `CSS.Transform` squashes a tall item onto a short neighbour's aspect ratio.
    // Items here have arbitrary sizes; they must only ever move. The
    // `sortable-list/no-scaling-transform` lint rule keeps this true repo-wide.
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const wrapperProps =
    handle || !listeners ? {} : { ...attributes, ...listeners };

  const state: SortableItemState = {
    isDragging,
    ...(handle
      ? {
          handleProps: {
            ...attributes,
            ...listeners,
            ref: setActivatorNodeRef,
          },
        }
      : {}),
  };

  const resolvedClassName =
    typeof className === "function" ? className(state) : className;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={resolvedClassName}
      {...extraWrapperProps}
      {...wrapperProps}
    >
      {children(state)}
    </div>
  );
}
