import { useCallback, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export interface RankReorderDndContextProps {
  /** Resolve + persist a drop. Receives the raw dnd-kit event; the active drag
   *  data carries `{ id, rank }`, the over droppable carries `{ zone, targetId }`
   *  (zone ∈ before|after, plus any tree-local zone like `child`). */
  onDragEnd: (event: DragEndEvent) => void;
  /** Floating drag-chip content for the active id (wrapped in the standard chip
   *  shell). Omit → no overlay. */
  dragOverlay?: (id: string) => ReactNode;
  /**
   * Re-measure droppables every frame so rows that mount mid-drag (windowed
   * lists, dnd-kit autoscroll bringing an off-screen target into view) become
   * valid drop targets. Pass the consumer's own windowed flag.
   */
  measuringAlways?: boolean;
  /** Children. A render-prop receives the active drag id (for windowed
   *  `keepMounted`); a plain node ignores it. */
  children: ReactNode | ((activeId: string | null) => ReactNode);
}

/**
 * The lifted DnD shell shared by every flat rank-reorder surface and the tree:
 * owns the `DndContext`, the `PointerSensor` (4px activation), `pointerWithin`
 * collision, the active-id lifecycle, the `MeasuringStrategy.Always` toggle for
 * windowed lists, and the `DragOverlay` chip. The drop *resolution* is injected
 * via `onDragEnd` — flat consumers go through `RankReorderProvider` (which
 * computes the rank via `computeFlatReorder`); the tree passes its own
 * `computeDrop`-based handler so it keeps its `child`-zone reparent logic.
 */
export function RankReorderDndContext({
  onDragEnd,
  dragOverlay,
  measuringAlways,
  children,
}: RankReorderDndContextProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const overlayNode = activeId && dragOverlay ? dragOverlay(activeId) : null;

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      onDragEnd(event);
    },
    [onDragEnd],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={
        measuringAlways
          ? { droppable: { strategy: MeasuringStrategy.Always } }
          : undefined
      }
      onDragStart={(event) =>
        setActiveId((event.active.data.current?.id as string | undefined) ?? null)
      }
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {typeof children === "function" ? children(activeId) : children}
      <DragOverlay dropAnimation={null}>
        {overlayNode != null ? (
          <Text
            as="div"
            variant="body"
            className="bg-background/90 border-accent rounded-md border px-sm py-xs shadow"
          >
            {overlayNode}
          </Text>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
