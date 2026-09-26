import { useMemo, type CSSProperties } from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Rank } from "@plugins/primitives/plugins/rank/core";

export interface RankSortableItemControls {
  /** The whole row is the drag source (Notion-style: no separate grip handle).
   *  Merge `ref` onto the row element. */
  ref: (el: HTMLElement | null) => void;
  /** Spread onto the same element as `ref`. */
  attributes: DraggableAttributes;
  /** Spread onto the same element as `ref`. */
  listeners: DraggableSyntheticListeners;
  /** Put on the same element as `ref`: the slide (and, while dragging, the
   *  follow-the-pointer offset plus a raised stacking layer). */
  style: CSSProperties;
  /** True while THIS item is the one being dragged. */
  isDragging: boolean;
}

/** The group a sortable item's dnd-kit data carries (`null` = ungrouped). */
export function sortableDataGroup(
  data: Record<string, unknown> | undefined,
): string | null {
  return (data?.group as string | null | undefined) ?? null;
}

/**
 * Per-row sortable wiring for a `RankReorderProvider`: the row both drags and
 * is the drop target, and slides out of the way while another row of its
 * group is dragged past it.
 *
 * `rank` may be `null` for a non-orderable row: a caller that must call this
 * hook unconditionally (hooks-rule compliance, e.g. a per-row decoration hook)
 * passes the null rank through and never attaches the returned ref; the item is
 * also disabled, so it takes part in no drag either way.
 *
 * `group` is the row's section key under group-by — the provider limits
 * collision to the dragged row's group unless the host offers `onReseat`.
 */
export function useRankSortableItem(
  id: string,
  rank: Rank | null,
  group?: string | null,
): RankSortableItemControls {
  const data = useMemo(
    () => ({ id, rank, group: group ?? null }),
    [id, rank, group],
  );
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, data, disabled: rank == null });

  const style: CSSProperties = {
    // Translate, NEVER `CSS.Transform`: without a DragOverlay dnd-kit scales the
    // dragged item to the rect it is over, squashing rows of other heights
    // (`sortable-list/no-scaling-transform`). Rows only ever move.
    transform: CSS.Translate.toString(transform),
    transition,
    // The dragged row paints over the neighbours it slides across.
    ...(isDragging
      ? { position: "relative" as const, zIndex: "var(--z-raised)" }
      : {}),
  };

  return { ref: setNodeRef, attributes, listeners, style, isDragging };
}
