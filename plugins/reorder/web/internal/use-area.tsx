import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
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
import { MdAdd, MdClose, MdSearch, MdStorefront } from "react-icons/md";
import { Input } from "@/components/ui/input";
import { Rank } from "@plugins/primitives/plugins/rank/shared";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { reorderPrefsResource } from "../../shared/resource";
import {
  lookupReorderConfig,
  type ReorderableSlot,
  type ReorderConfig,
} from "./area";
import { useEditMode } from "./edit-mode-store";

type BaseItem = { id: string; excludeFromReorder?: boolean };

// --- Spacer items -----------------------------------------------------------

export const SPACER_PREFIX = "__spacer__";

export type SpacerItem = { readonly id: string; readonly _spacer: true };

export function isSpacer(item: { id: string }): item is SpacerItem {
  return item.id.startsWith(SPACER_PREFIX);
}

// -----------------------------------------------------------------------------

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
  /** Contributions only (no spacers). Backward-compatible with existing hosts. */
  items: P[];
  /** Full ordered list including spacer items. Use this when rendering spacers. */
  entries: (P | SpacerItem)[];
  hiddenItems: P[];
  editMode: boolean;
  DndWrapper: ComponentType<{ children: ReactNode }>;
  ReorderItem: ComponentType<{ item: P | SpacerItem; children: ReactNode }>;
};

// --- Area context (shared between DndWrapper, ReorderItem, RestoreButton) ---

type InsertionIndicator = {
  itemId: string;
  position: "before" | "after";
} | null;

type ReorderAreaCtxValue = {
  storageId: string;
  hiddenItems: BaseItem[];
  getLabel: (item: BaseItem) => string;
  insertionIndicator: InsertionIndicator;
  addSpacer: () => void;
};
const ReorderAreaContext = createContext<ReorderAreaCtxValue | null>(null);

// ---------------------------------------------------------------------------

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

  const slotGetLabel = slotCfg?.getLabel as
    | ((item: P) => string)
    | undefined;
  const effectiveGetLabel = useCallback(
    (item: BaseItem): string =>
      slotGetLabel?.(item as P) ??
      (item as Record<string, unknown>)._pluginName as string ??
      item.id,
    [slotGetLabel],
  );

  const raw = slot.useContributions();
  const { data: rankMap } = useResource(reorderPrefsResource, {
    slotId: storageId,
  });

  const { items, entries, hiddenItems } = useMemo(() => {
    const filtered = filter ? raw.filter(filter) : raw;

    const visible: (P | SpacerItem)[] = [];
    const hidden: P[] = [];
    for (const item of filtered) {
      if (rankMap?.[item.id]?.hidden && !item.excludeFromReorder) {
        hidden.push(item);
      } else {
        visible.push(item);
      }
    }

    // Inject spacer items from rankMap
    if (rankMap) {
      for (const key of Object.keys(rankMap)) {
        if (key.startsWith(SPACER_PREFIX) && rankMap[key]?.rank) {
          visible.push({ id: key, _spacer: true as const });
        }
      }
    }

    // Group order is fixed by natural-order discovery (first appearance).
    const groupOrder: string[] = [];
    const groupOf = (it: P | SpacerItem): string =>
      isSpacer(it) ? "" : getGroup ? (getGroup(it) ?? "") : "";
    for (const it of visible) {
      const g = groupOf(it);
      if (!groupOrder.includes(g)) groupOrder.push(g);
    }

    const sorted = visible
      .map((item, naturalIdx) => ({
        item,
        naturalIdx: isSpacer(item) ? Infinity : naturalIdx,
      }))
      .sort((a, b) => {
        const ga = groupOrder.indexOf(groupOf(a.item));
        const gb = groupOrder.indexOf(groupOf(b.item));
        if (ga !== gb) return ga - gb;
        const ax = isSpacer(a.item) ? false : !!a.item.excludeFromReorder;
        const bx = isSpacer(b.item) ? false : !!b.item.excludeFromReorder;
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

    const entries = sorted;
    const items = sorted.filter((x): x is P => !isSpacer(x));
    return { items, entries, hiddenItems: hidden };
  }, [raw, rankMap, filter, getGroup]);

  const itemsRef = useRef<(P | SpacerItem)[]>(entries);
  itemsRef.current = entries;
  const rankMapRef = useRef(rankMap);
  rankMapRef.current = rankMap;
  const getGroupRef = useRef(getGroup);
  getGroupRef.current = getGroup;
  const hiddenItemsRef = useRef<P[]>(hiddenItems);
  hiddenItemsRef.current = hiddenItems;
  const getLabelRef = useRef(effectiveGetLabel);
  getLabelRef.current = effectiveGetLabel;
  const storageIdRef = useRef(storageId);
  storageIdRef.current = storageId;

  const onDrop = useCallback(
    (draggedKey: string, overKey: string) => {
      if (draggedKey === overKey) return;
      const list = itemsRef.current;
      const draggedIdx = list.findIndex((x) => x.id === draggedKey);
      const overIdx = list.findIndex((x) => x.id === overKey);
      if (draggedIdx < 0 || overIdx < 0) return;

      const dragged = list[draggedIdx]!;
      const target = list[overIdx]!;
      const draggedExcluded = isSpacer(dragged)
        ? false
        : !!dragged.excludeFromReorder;
      const targetExcluded = isSpacer(target)
        ? false
        : !!target.excludeFromReorder;
      if (draggedExcluded || targetExcluded) return;

      const gg = getGroupRef.current;
      const groupValue = gg && !isSpacer(dragged) ? gg(dragged) : null;
      if (gg && !isSpacer(target) && gg(target) !== groupValue) return;

      const siblings = list.filter((x) => {
        if (x.id === draggedKey) return false;
        if (isSpacer(x)) return true;
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

  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const DndWrapper = useMemo(
    () =>
      function DndWrapperBound({ children }: { children: ReactNode }) {
        const em = useEditMode();
        const sensors = useSensors(
          useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        );
        const [activeId, setActiveId] = useState<string | null>(null);
        const [overId, setOverId] = useState<string | null>(null);

        let insertionIndicator: InsertionIndicator = null;
        if (activeId && overId && activeId !== overId) {
          const list = itemsRef.current;
          const draggedIdx = list.findIndex((x) => x.id === activeId);
          const overIdx = list.findIndex((x) => x.id === overId);
          if (draggedIdx >= 0 && overIdx >= 0) {
            insertionIndicator = {
              itemId: overId,
              position: draggedIdx < overIdx ? "after" : "before",
            };
          }
        }

        function addSpacer() {
          const sid = storageIdRef.current;
          const rm = rankMapRef.current;
          const items = itemsRef.current;
          const patch = (contributionId: string, rank: Rank) =>
            void fetch(`/api/reorder/${sid}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contributionId, rank: String(rank) }),
            });

          // Rank all unranked items first to stabilize sort order for DnD
          let prevR: Rank | null = null;
          for (const item of items) {
            if (isSpacer(item)) continue;
            const existing = rm?.[item.id]?.rank ?? null;
            if (existing) {
              prevR = existing;
            } else {
              const newR = Rank.between(prevR, null);
              prevR = newR;
              patch(item.id, newR);
            }
          }

          // Add the spacer after all items
          const spacerRank = Rank.between(prevR, null);
          patch(`${SPACER_PREFIX}${crypto.randomUUID()}`, spacerRank);
        }

        const ctxValue: ReorderAreaCtxValue = {
          storageId: storageIdRef.current,
          hiddenItems: hiddenItemsRef.current,
          getLabel: getLabelRef.current,
          insertionIndicator,
          addSpacer,
        };
        return (
          <ReorderAreaContext.Provider value={ctxValue}>
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={(e) => {
                setActiveId(
                  stripPrefix(DRAG_PREFIX, String(e.active.id)),
                );
              }}
              onDragOver={(e) => {
                setOverId(
                  e.over
                    ? stripPrefix(DROP_PREFIX, String(e.over.id))
                    : null,
                );
              }}
              onDragEnd={(e: DragEndEvent) => {
                const draggedKey = stripPrefix(
                  DRAG_PREFIX,
                  String(e.active.id),
                );
                const overKey = e.over
                  ? stripPrefix(DROP_PREFIX, String(e.over.id))
                  : null;
                if (overKey) onDropRef.current(draggedKey, overKey);
                setActiveId(null);
                setOverId(null);
              }}
              onDragCancel={() => {
                setActiveId(null);
                setOverId(null);
              }}
            >
              {children}
              {em && <RestoreButton />}
            </DndContext>
          </ReorderAreaContext.Provider>
        );
      },
    [],
  );

  return {
    items,
    entries,
    hiddenItems,
    editMode,
    DndWrapper,
    ReorderItem: ReorderItem as ComponentType<{
      item: P | SpacerItem;
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
  item: BaseItem | SpacerItem;
  children: ReactNode;
}) {
  const editMode = useEditMode();
  if (isSpacer(item)) {
    return <SpacerReorderItem item={item} editMode={editMode} />;
  }
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
  const ctx = useContext(ReorderAreaContext);
  const draggable = useDraggable({ id: `${DRAG_PREFIX}${item.id}` });
  const droppable = useDroppable({ id: `${DROP_PREFIX}${item.id}` });

  const transform = draggable.transform;
  const isDragging = draggable.isDragging;

  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : {
        touchAction: "none",
      };

  function handleHide(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ctx) return;
    void fetch(`/api/reorder/${ctx.storageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId: item.id, hidden: true }),
    });
  }

  const indicator = ctx?.insertionIndicator;
  const showBefore =
    indicator?.itemId === item.id && indicator.position === "before";
  const showAfter =
    indicator?.itemId === item.id && indicator.position === "after";

  return (
    <>
      {showBefore && <div className="reorder-drop-indicator" />}
      <div
        ref={(node) => {
          draggable.setNodeRef(node);
          droppable.setNodeRef(node);
        }}
        {...draggable.attributes}
        {...draggable.listeners}
        style={style}
        className={[
          "group relative cursor-grab rounded-md ring-1 ring-primary/50",
          isDragging && "opacity-40",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none cursor-pointer opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleHide}
          aria-label={`Hide ${item.id}`}
        >
          <MdClose className="size-2.5" />
        </button>
        <div className="pointer-events-none">{children}</div>
      </div>
      {showAfter && <div className="reorder-drop-indicator" />}
    </>
  );
}

function SpacerReorderItem({
  item,
  editMode,
}: {
  item: SpacerItem;
  editMode: boolean;
}) {
  const ctx = useContext(ReorderAreaContext);
  const draggable = useDraggable({ id: `${DRAG_PREFIX}${item.id}` });
  const droppable = useDroppable({ id: `${DROP_PREFIX}${item.id}` });

  if (!editMode) {
    return (
      <div
        ref={(node) => {
          droppable.setNodeRef(node);
        }}
        className="flex-1"
      />
    );
  }

  const transform = draggable.transform;
  const isDragging = draggable.isDragging;
  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : { touchAction: "none" };

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ctx) return;
    void fetch(`/api/reorder/${ctx.storageId}/${item.id}`, {
      method: "DELETE",
    });
  }

  const indicator = ctx?.insertionIndicator;
  const showBefore =
    indicator?.itemId === item.id && indicator.position === "before";
  const showAfter =
    indicator?.itemId === item.id && indicator.position === "after";

  return (
    <>
      {showBefore && <div className="reorder-drop-indicator" />}
      <div
        ref={(node) => {
          draggable.setNodeRef(node);
          droppable.setNodeRef(node);
        }}
        {...draggable.attributes}
        {...draggable.listeners}
        style={style}
        className={[
          "group relative flex h-7 min-w-8 flex-1 cursor-grab items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-2",
          isDragging && "opacity-40",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="text-[10px] text-muted-foreground/60 select-none">
          ⇔
        </span>
        <button
          className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none cursor-pointer opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          aria-label="Remove spacer"
        >
          <MdClose className="size-2.5" />
        </button>
      </div>
      {showAfter && <div className="reorder-drop-indicator" />}
    </>
  );
}

function RestoreButton() {
  const ctx = useContext(ReorderAreaContext)!;
  const [open, setOpen] = useState(false);
  const hasHidden = ctx.hiddenItems.length > 0;

  function handleRestore(contributionId: string) {
    void fetch(`/api/reorder/${ctx.storageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId, hidden: false }),
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 px-2.5 text-xs text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label="Add items"
      >
        <MdAdd className="size-3.5" />
        {hasHidden
          ? ctx.hiddenItems.length === 1
            ? "1 hidden"
            : `${ctx.hiddenItems.length} hidden`
          : "Add"}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        {hasHidden && (
          <div className="p-1">
            {ctx.hiddenItems.map((item) => (
              <button
                key={item.id}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  handleRestore(item.id);
                  if (ctx.hiddenItems.length <= 1) setOpen(false);
                }}
              >
                <MdAdd className="size-3.5 shrink-0 text-muted-foreground" />
                {ctx.getLabel(item)}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border p-1">
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              ctx.addSpacer();
              setOpen(false);
            }}
          >
            <MdAdd className="size-3.5 shrink-0 text-muted-foreground" />
            Add Spacer
          </button>
        </div>

        <div className="border-t border-border px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <MdStorefront className="size-3.5" />
            Marketplace
          </div>
          <div className="relative">
            <MdSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search..."
              className="h-7 pl-7 text-xs"
              disabled
            />
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground/60">
            No items
          </p>
        </div>

        <div className="border-t border-border p-1">
          <button
            disabled
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed"
          >
            <MdAdd className="size-3.5 shrink-0" />
            Create custom plugin
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
