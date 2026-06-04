import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MdAdd,
  MdFilterAlt,
  MdFilterAltOff,
} from "react-icons/md";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  buildTree,
  computeDrop,
  isDescendant,
  type DropZone,
  type TreeNode,
} from "../../core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { SearchInput, filterTree } from "@plugins/primitives/plugins/search/web";
import { cn } from "@/lib/utils";
import { pendingFocus } from "./pending-focus";
import { TreeListProvider } from "./use-tree-row";
import type { TreeItem } from "./types";

export type TreeListProps<T extends TreeItem> = {
  rows: readonly T[];
  selectedId?: string;
  rootId?: string;
  onSelect: (id: string) => void;
  onToggleExpanded: (id: string, next: boolean) => void | Promise<void>;
  onMove: (
    id: string,
    dest: { parentId: string | null; rank: Rank },
  ) => void | Promise<void>;
  onCreate: (args: {
    parentId: string | null;
    rank?: Rank;
  }) => Promise<string | null | undefined>;
  /** The component used to render every row. Recursion through children is
   * handled by RowChrome (which reads this from context). */
  Row: (props: { node: TreeNode<T>; depth: number }) => ReactNode;
  /** Content shown in the floating chip while a row is being dragged. */
  dragOverlay?: (row: T) => ReactNode;
  toolbar?: {
    expandAll?: boolean;
    hideTerminal?: {
      isTerminal: (row: T) => boolean;
      value?: boolean;
      onValueChange?: (v: boolean) => void;
    };
    search?: { accessor: (row: T) => string };
    /** Extra content rendered on the left side of the toolbar row. */
    start?: ReactNode;
  };
  /** Root-level "Add" button label. Pass `null` to hide (e.g. subtree mode). */
  addLabel?: string | null;
};

export function TreeList<T extends TreeItem>(props: TreeListProps<T>) {
  const {
    rows,
    selectedId,
    rootId,
    onSelect,
    onToggleExpanded,
    onMove,
    onCreate,
    Row,
    dragOverlay,
    toolbar,
    addLabel = "Add",
  } = props;

  const [internalHide, setInternalHide] = useState(true);
  const hideTerminal = toolbar?.hideTerminal?.value ?? internalHide;
  const setHideTerminal = toolbar?.hideTerminal?.onValueChange ?? setInternalHide;
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(() =>
    pendingFocus.take(),
  );
  const clearPendingFocus = useCallback(() => setPendingFocusId(null), []);

  const [optimisticExpanded, setOptimisticExpanded] = useState<
    Map<string, boolean>
  >(() => new Map());

  // Clear overrides once the server push confirms the value.
  useEffect(() => {
    if (optimisticExpanded.size === 0) return;
    const stale = [...optimisticExpanded.entries()].filter(([id, v]) => {
      const row = rows.find((r) => r.id === id);
      return !row || row.expanded === v;
    });
    if (stale.length === 0) return;
    setOptimisticExpanded((prev) => {
      const next = new Map(prev);
      stale.forEach(([id]) => next.delete(id));
      return next;
    });
  }, [rows, optimisticExpanded]);

  const wrappedOnToggleExpanded = useCallback(
    (id: string, next: boolean) => {
      setOptimisticExpanded((prev) => new Map(prev).set(id, next));
      return onToggleExpanded(id, next);
    },
    [onToggleExpanded],
  );

  const createAtRoot = useCallback(
    async (parentId: string | null, rank?: Rank) => {
      const id = await onCreate({ parentId, rank });
      if (!id) return;
      pendingFocus.set(id);
      setPendingFocusId(id);
      onSelect(id);
    },
    [onCreate, onSelect],
  );

  const scopedBase = useMemo(
    () => (rootId ? filterSubtree(rows, rootId) : [...rows]),
    [rows, rootId],
  );
  const scoped = useMemo(
    () =>
      optimisticExpanded.size === 0
        ? scopedBase
        : scopedBase.map((r) => {
            const ov = optimisticExpanded.get(r.id);
            return ov !== undefined ? { ...r, expanded: ov } : r;
          }),
    [scopedBase, optimisticExpanded],
  );
  const tree = useMemo(() => buildTree(scoped), [scoped]);

  const [searchQuery, setSearchQuery] = useState("");
  const searchAccessor = toolbar?.search?.accessor;
  const afterSearch = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle || !searchAccessor) return tree;
    return filterTree<TreeNode<T>>(
      tree,
      (n) => searchAccessor(n).toLowerCase().includes(needle),
      (n) => n.children,
      (n, children) => ({ ...n, expanded: true, children }),
    );
  }, [tree, searchQuery, searchAccessor]);

  const isTerminal = toolbar?.hideTerminal?.isTerminal;
  const visibleTree = useMemo(
    () =>
      hideTerminal && isTerminal
        ? hideTerminalSubtrees(afterSearch, isTerminal)
        : afterSearch,
    [afterSearch, hideTerminal, isTerminal],
  );

  const nodesWithChildren = useMemo(() => {
    const childSet = new Set(
      scoped.filter((r) => r.parentId).map((r) => r.parentId!),
    );
    return scoped.filter((r) => childSet.has(r.id));
  }, [scoped]);
  const showExpandAll = !!toolbar?.expandAll && nodesWithChildren.length > 0;
  const allExpanded =
    nodesWithChildren.length > 0 && nodesWithChildren.every((r) => r.expanded);
  const expandAll = useCallback(async () => {
    const next = !allExpanded;
    await Promise.all(
      nodesWithChildren
        .filter((r) => r.expanded !== next)
        .map(async (r) => wrappedOnToggleExpanded(r.id, next)),
    );
  }, [nodesWithChildren, allExpanded, wrappedOnToggleExpanded]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeOverlay = useMemo(() => {
    if (!activeId) return null;
    const row = rows.find((r) => r.id === activeId);
    if (!row) return null;
    return dragOverlay ? dragOverlay(row) : "Item";
  }, [activeId, rows, dragOverlay]);

  const onDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.data.current?.id as string | undefined;
    setActiveId(id ?? null);
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;
      const draggedId = active.data.current?.id as string | undefined;
      const zone = over.data.current?.zone as DropZone | undefined;
      const targetId = over.data.current?.targetId as string | undefined;
      if (!draggedId || !zone || !targetId) return;
      if (draggedId === targetId) return;
      if (isDescendant(rows, draggedId, targetId)) return;
      const dest = computeDrop(rows, draggedId, zone, targetId);
      if (!dest) return;
      const current = rows.find((r) => r.id === draggedId);
      if (
        current &&
        current.parentId === dest.parentId &&
        Rank.equals(current.rank, dest.rank)
      ) {
        return;
      }
      void onMove(draggedId, dest);
    },
    [rows, onMove],
  );

  // Auto-expand collapsed ancestors when selectedId changes so the row is visible.
  const lastRevealedId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedId) {
      lastRevealedId.current = undefined;
      return;
    }
    if (selectedId === lastRevealedId.current) return;
    const byId = new Map(rows.map((r) => [r.id, r]));
    if (!byId.has(selectedId)) return;
    lastRevealedId.current = selectedId;
    let cur = byId.get(selectedId)!.parentId;
    while (cur) {
      const parent = byId.get(cur);
      if (!parent) break;
      if (!parent.expanded) void wrappedOnToggleExpanded(cur, true);
      cur = parent.parentId;
    }
  }, [selectedId, rows, wrappedOnToggleExpanded]);

  const hasToolbar =
    showExpandAll || !!toolbar?.hideTerminal || !!toolbar?.start || !!toolbar?.search;
  const showRootAdd = !rootId && addLabel != null;

  const ctxValue = useMemo(
    () => ({
      rows,
      selectedId,
      activeId,
      pendingFocusId,
      clearPendingFocus,
      onSelect,
      onToggleExpanded: wrappedOnToggleExpanded,
      onCreate,
      Row,
    }),
    [
      rows,
      selectedId,
      activeId,
      pendingFocusId,
      clearPendingFocus,
      onSelect,
      wrappedOnToggleExpanded,
      onCreate,
      Row,
    ],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <TreeListProvider value={ctxValue}>
        <div className="flex flex-col gap-0.5">
          {hasToolbar && (
            <div className="sticky top-0 z-10 bg-background mb-1 flex items-center gap-1">
              <div className="flex items-center gap-1">
                {toolbar.search && (
                  <SearchInput
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearchQuery("");
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="Filter…"
                    className="w-32"
                  />
                )}
                {toolbar.start}
              </div>
              <div className="ml-auto flex items-center gap-1">
                {showExpandAll && (
                  <ExpandAllButton allExpanded={allExpanded} onToggle={expandAll} />
                )}
                {toolbar.hideTerminal && (
                  <button
                    type="button"
                    onClick={() => setHideTerminal(!hideTerminal)}
                    aria-pressed={hideTerminal}
                    title={hideTerminal ? "Show completed" : "Hide completed"}
                    className={cn(
                      "hover:bg-accent flex w-fit items-center gap-1 rounded px-2 py-1 text-xs",
                      hideTerminal ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {hideTerminal ? (
                      <MdFilterAlt className="size-4" />
                    ) : (
                      <MdFilterAltOff className="size-4" />
                    )}
                    {hideTerminal ? "Completed hidden" : "Hide completed"}
                  </button>
                )}
              </div>
            </div>
          )}
          {visibleTree.map((node) => (
            <Row key={node.id} node={node} depth={0} />
          ))}
          {showRootAdd && (
            <button
              type="button"
              onClick={() => void createAtRoot(null)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground mt-1 flex w-fit items-center gap-1 rounded px-2 py-1 text-sm"
            >
              <MdAdd className="size-4" />
              {addLabel}
            </button>
          )}
        </div>
      </TreeListProvider>
      <DragOverlay dropAnimation={null}>
        {activeOverlay !== null ? (
          // eslint-disable-next-line badge/no-adhoc-chip -- drag overlay container, not a chip
          <div className="bg-background/90 border-accent rounded border px-2 py-1 text-sm shadow">
            {activeOverlay}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function hideTerminalSubtrees<T extends TreeItem>(
  tree: TreeNode<T>[],
  isTerminal: (row: T) => boolean,
): TreeNode<T>[] {
  const fullyTerminal = (n: TreeNode<T>): boolean =>
    isTerminal(n) && n.children.every(fullyTerminal);
  return tree
    .filter((n) => !fullyTerminal(n))
    .map((n) => ({
      ...n,
      children: hideTerminalSubtrees(n.children, isTerminal),
    }));
}

function filterSubtree<T extends TreeItem>(
  rows: readonly T[],
  rootId: string,
): T[] {
  const keep = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parentId && keep.has(r.parentId) && !keep.has(r.id)) {
        keep.add(r.id);
        grew = true;
      }
    }
  }
  return rows.filter((r) => keep.has(r.id));
}
