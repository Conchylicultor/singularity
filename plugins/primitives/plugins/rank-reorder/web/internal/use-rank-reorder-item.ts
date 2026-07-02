import { useMemo } from "react";
import {
  useDraggable,
  useDroppable,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { Rank } from "@plugins/primitives/plugins/rank/core";

export interface RankReorderItemControls {
  /**
   * The whole row is the drag source (Notion-style: no separate grip handle).
   * Merge `ref` onto the row element and spread `attributes`/`listeners` onto it.
   */
  dragSource: {
    ref: (el: HTMLElement | null) => void;
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
  };
  /** True while THIS item is the one being dragged. */
  isDragging: boolean;
  /** Attach to the row's top drop-zone element. */
  beforeRef: (el: HTMLElement | null) => void;
  /** Attach to the row's bottom drop-zone element. */
  afterRef: (el: HTMLElement | null) => void;
  /** True while a drag hovers the `before` zone (paint the top indicator). */
  isOverBefore: boolean;
  /** True while a drag hovers the `after` zone (paint the bottom indicator). */
  isOverAfter: boolean;
}

/**
 * Per-row draggable + before/after droppables for a flat rank-reorder list. The
 * droppable data shape (`{ zone, targetId }`) and draggable data (`{ id, rank }`)
 * are the shared contract the `RankReorderDndContext` `onDragEnd` reads — the
 * same shape the tree's sibling zones use, so the tree consumes this hook for
 * its before/after zones while keeping its own `child` droppable.
 *
 * `rank` may be `null` for a non-orderable row: a caller that must call this
 * hook unconditionally (hooks-rule compliance, e.g. a per-row decoration hook)
 * passes the null rank through but never attaches the returned refs, so the
 * row's draggable/droppables register no DOM node and it participates in no drag.
 */
export function useRankReorderItem(
  id: string,
  rank: Rank | null,
): RankReorderItemControls {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `rr-drag:${id}`,
    data: { id, rank },
  });
  const { isOver: isOverBefore, setNodeRef: setBeforeRef } = useDroppable({
    id: `rr-before:${id}`,
    data: { zone: "before" as const, targetId: id },
  });
  const { isOver: isOverAfter, setNodeRef: setAfterRef } = useDroppable({
    id: `rr-after:${id}`,
    data: { zone: "after" as const, targetId: id },
  });

  const dragSource = useMemo(
    () => ({ ref: setDragRef, attributes, listeners }),
    [setDragRef, attributes, listeners],
  );

  return {
    dragSource,
    isDragging,
    beforeRef: setBeforeRef,
    afterRef: setAfterRef,
    isOverBefore,
    isOverAfter,
  };
}
