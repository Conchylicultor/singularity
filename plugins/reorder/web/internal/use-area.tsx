import {
  useCallback,
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Rank } from "@plugins/primitives/plugins/rank/shared";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { reorderPrefsResource } from "../../shared/resource";
import {
  lookupReorderConfig,
  type ReorderableSlot,
  type ReorderConfig,
} from "./area";
import { useEditMode } from "./edit-mode-store";

type BaseItem = { id: string; excludeFromReorder?: boolean };

export type HostOverride<P extends BaseItem> = {
  /** Per-host filter (e.g. Shell.Sidebar's three sub-lists each pick a subset). */
  filter?: (item: P) => boolean;
  /** Override the slot-level getGroup for this host. */
  getGroup?: (item: P) => string | null;
  /**
   * Sub-namespace, required when one slot is rendered as multiple disjoint host
   * areas (e.g. Shell.Sidebar split into buttons / pinned-panes / scroll-panes).
   * Ranks are stored under `${slot.id}:${subId}` so contributions in different
   * sub-areas can share an `id` without colliding on the rank row.
   */
  subId?: string;
};

export type UseAreaResult<P extends BaseItem> = {
  items: P[];
  editMode: boolean;
  DndWrapper: ComponentType<{ children: ReactNode }>;
  ReorderItem: ComponentType<{ item: P; children: ReactNode }>;
};

const warnedSlots = new Set<string>();

export function useArea<P extends BaseItem>(
  slot: ReorderableSlot<P>,
  override?: HostOverride<P>,
): UseAreaResult<P> {
  const slotCfg = lookupReorderConfig(slot.id) as ReorderConfig<P> | undefined;
  if (!slotCfg && !warnedSlots.has(slot.id)) {
    warnedSlots.add(slot.id);
    console.warn(
      `[reorder] useArea("${slot.id}") was called but the slot was never wrapped with Reorder.area. ` +
        `Wrap the slot in its owning plugin's slots.ts to register grouping.`,
    );
  }
  const editMode = useEditMode();
  const getGroup = override?.getGroup ?? slotCfg?.getGroup;
  const filter = override?.filter;
  const storageId = override?.subId ? `${slot.id}:${override.subId}` : slot.id;

  const raw = slot.useContributions();
  const { data: rankMap } = useResource(reorderPrefsResource, {
    slotId: storageId,
  });

  const items = useMemo<P[]>(() => {
    const filtered = filter ? raw.filter(filter) : raw;

    // Group order is fixed by natural-order discovery (first appearance).
    const groupOrder: string[] = [];
    const groupOf = (it: P): string => (getGroup ? (getGroup(it) ?? "") : "");
    for (const it of filtered) {
      const g = groupOf(it);
      if (!groupOrder.includes(g)) groupOrder.push(g);
    }

    return filtered
      .map((item, naturalIdx) => ({ item, naturalIdx }))
      .sort((a, b) => {
        const ga = groupOrder.indexOf(groupOf(a.item));
        const gb = groupOrder.indexOf(groupOf(b.item));
        if (ga !== gb) return ga - gb;
        // Excluded items are pinned to the tail of their group, in natural
        // order. This keeps non-reorderable contributions (e.g. the pen button)
        // at a predictable spot regardless of how their reorderable peers rank.
        const ax = !!a.item.excludeFromReorder;
        const bx = !!b.item.excludeFromReorder;
        if (ax !== bx) return ax ? 1 : -1;
        if (ax && bx) return a.naturalIdx - b.naturalIdx;
        const ar = rankMap?.[a.item.id]?.rank ?? null;
        const br = rankMap?.[b.item.id]?.rank ?? null;
        if (ar && br) return Rank.compare(ar, br);
        if (ar) return -1;
        if (br) return 1;
        return a.naturalIdx - b.naturalIdx;
      })
      .map((row) => row.item);
  }, [raw, rankMap, filter, getGroup]);

  // Reads of `items` / `rankMap` / `getGroup` from inside onDrop go through
  // refs so onDrop's identity stays stable across re-renders. That, plus
  // DndWrapper being memoized with no deps, keeps DndContext + every
  // ReorderItem mounted across drops and edit-mode toggles.
  const itemsRef = useRef<P[]>(items);
  itemsRef.current = items;
  const rankMapRef = useRef(rankMap);
  rankMapRef.current = rankMap;
  const getGroupRef = useRef(getGroup);
  getGroupRef.current = getGroup;

  const onDrop = useCallback(
    (draggedKey: string, overKey: string) => {
      if (draggedKey === overKey) return;
      const list = itemsRef.current;
      const draggedIdx = list.findIndex((x) => x.id === draggedKey);
      const overIdx = list.findIndex((x) => x.id === overKey);
      if (draggedIdx < 0 || overIdx < 0) return;

      const dragged = list[draggedIdx]!;
      const target = list[overIdx]!;
      if (dragged.excludeFromReorder || target.excludeFromReorder) return;

      const gg = getGroupRef.current;
      const groupValue = gg ? gg(dragged) : null;
      if (gg && gg(target) !== groupValue) return;

      const siblings = list.filter((x) => {
        if (x.id === draggedKey) return false;
        if (x.excludeFromReorder) return false;
        if (!gg) return true;
        return gg(x) === groupValue;
      });
      const tIdx = siblings.findIndex((x) => x.id === overKey);
      if (tIdx < 0) return;

      const movingDown = draggedIdx < overIdx;
      const prev = movingDown ? siblings[tIdx]! : (siblings[tIdx - 1] ?? null);
      const next = movingDown ? (siblings[tIdx + 1] ?? null) : siblings[tIdx]!;

      const rm = rankMapRef.current;
      const prevRank = prev ? (rm?.[prev.id]?.rank ?? null) : null;
      const nextRank = next ? (rm?.[next.id]?.rank ?? null) : null;

      let newRank: Rank;
      try {
        newRank = Rank.between(prevRank, nextRank);
      } catch {
        return;
      }

      void fetch(`/api/reorder/${storageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributionId: draggedKey, rank: newRank }),
      });
    },
    [storageId],
  );

  // The host renders <area.DndWrapper> at a fixed JSX position. DndWrapper's
  // identity is stable across the hook's lifetime so React keeps the inner
  // DndContext (and every ReorderItem under it) mounted across drops and
  // edit-mode toggles. The wrapper reads the latest onDrop via the ref.
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const DndWrapper = useMemo(
    () =>
      function DndWrapperBound({ children }: { children: ReactNode }) {
        const sensors = useSensors(
          useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        );
        return (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragEnd={(e: DragEndEvent) => {
              const draggedKey = stripPrefix(DRAG_PREFIX, String(e.active.id));
              const overKey = e.over
                ? stripPrefix(DROP_PREFIX, String(e.over.id))
                : null;
              if (overKey) onDropRef.current(draggedKey, overKey);
            }}
          >
            {children}
          </DndContext>
        );
      },
    [],
  );

  return {
    items,
    editMode,
    DndWrapper,
    ReorderItem: ReorderItem as ComponentType<{
      item: P;
      children: ReactNode;
    }>,
  };
}

const DRAG_PREFIX = "reorder-drag-";
const DROP_PREFIX = "reorder-drop-";
const stripPrefix = (prefix: string, s: string) =>
  s.startsWith(prefix) ? s.slice(prefix.length) : s;

function ReorderItem({
  item,
  children,
}: {
  item: BaseItem;
  children: ReactNode;
}) {
  const editMode = useEditMode();
  if (!editMode || item.excludeFromReorder) {
    return <>{children}</>;
  }
  return <ReorderItemActive item={item}>{children}</ReorderItemActive>;
}

function ReorderItemActive({
  item,
  children,
}: {
  item: BaseItem;
  children: ReactNode;
}) {
  const draggable = useDraggable({ id: `${DRAG_PREFIX}${item.id}` });
  const droppable = useDroppable({ id: `${DROP_PREFIX}${item.id}` });

  // Deterministic per-item delay so the wiggle doesn't sync across items.
  const delay = useMemo(
    () => (item.id.length * 37) % 200,
    [item.id],
  );

  const transform = draggable.transform;
  const isDragging = draggable.isDragging;

  // While dragging, dnd-kit owns the transform (translate). The CSS wiggle
  // animation also targets transform, so it must be suspended during a drag.
  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : {
        animationDelay: `-${delay}ms`,
        touchAction: "none",
      };

  return (
    <div
      ref={(node) => {
        draggable.setNodeRef(node);
        droppable.setNodeRef(node);
      }}
      {...draggable.attributes}
      {...draggable.listeners}
      style={style}
      className={[
        "relative cursor-grab",
        isDragging ? "opacity-40" : "reorder-wiggle",
        droppable.isOver && !isDragging
          ? "ring-2 ring-primary/60 rounded-md"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="pointer-events-none">{children}</div>
    </div>
  );
}
