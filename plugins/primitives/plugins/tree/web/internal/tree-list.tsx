import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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
import {
  MultiSelectProvider,
  SelectionBar,
} from "@plugins/primitives/plugins/multi-select/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { pendingFocus } from "./pending-focus";
import { TreeListProvider } from "./use-tree-row";
import type { TreeItem } from "./types";

export type TreeListProps<T extends TreeItem> = {
  rows: readonly T[];
  selectedId?: string;
  rootId?: string;
  onSelect: (id: string) => void;
  onToggleExpanded: (id: string, next: boolean) => void | Promise<void>;
  /** DnD reorder/reparent. Omit for a read-only tree — the drag handle disappears. */
  onMove?: (
    id: string,
    dest: { parentId: string | null; rank: Rank },
  ) => void | Promise<void>;
  /** Create child/sibling. Omit for a read-only tree — every Add affordance disappears. */
  onCreate?: (args: {
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
    search?: {
      accessor: (row: T) => string;
      /** Controlled query value. When set, used instead of TreeList's own state. */
      query?: string;
      /** Hide TreeList's own SearchInput (a host toolbar renders one). */
      hideInput?: boolean;
    };
    /** Extra content rendered on the left side of the toolbar row. */
    start?: ReactNode;
  };
  /** Root-level "Add" button label. Pass `null` to hide (e.g. subtree mode). */
  addLabel?: string | null;
  /**
   * Whether the data source supports creation. Defaults to true (matching the
   * historical always-on add affordance). Drives the per-row hover "+" so a
   * read-only tree shows no non-functional add button.
   */
  canCreate?: boolean;
  /**
   * Opt-in checkbox multi-select. Present → each row renders a `SelectionCheckbox`
   * and a `SelectionBar` (with optional bulk `actions`) sits above the rows. The
   * select order is derived from the visible tree (DFS, skipping collapsed
   * subtrees) so shift-range selection matches exactly what is painted.
   */
  multiSelect?: { actions?: ReactNode };
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
    canCreate = true,
    multiSelect,
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
      if (!onCreate) return;
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
  // Controlled when `query` is supplied (host toolbar drives it); else internal.
  const controlledQuery = toolbar?.search?.query;
  const effectiveQuery = controlledQuery ?? searchQuery;
  const hideSearchInput = toolbar?.search?.hideInput ?? false;
  const afterSearch = useMemo(() => {
    const needle = effectiveQuery.trim().toLowerCase();
    if (!needle || !searchAccessor) return tree;
    return filterTree<TreeNode<T>>(
      tree,
      (n) => searchAccessor(n).toLowerCase().includes(needle),
      (n) => n.children,
      (n, children) => ({ ...n, expanded: true, children }),
    );
  }, [tree, effectiveQuery, searchAccessor]);

  const isTerminal = toolbar?.hideTerminal?.isTerminal;
  const visibleTree = useMemo(
    () =>
      hideTerminal && isTerminal
        ? hideTerminalSubtrees(afterSearch, isTerminal)
        : afterSearch,
    [afterSearch, hideTerminal, isTerminal],
  );

  // Visible selection order: DFS over the painted tree, descending into a node's
  // children only when it is expanded. Drives MultiSelectProvider so shift-range
  // selection spans exactly the rows on screen (collapsed subtrees excluded).
  const orderedIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: TreeNode<T>[]) => {
      for (const node of nodes) {
        ids.push(node.id);
        if (node.expanded) walk(node.children);
      }
    };
    walk(visibleTree);
    return ids;
  }, [visibleTree]);

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
      if (!onMove) return;
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

  const showSearchInput = !!toolbar?.search && !hideSearchInput;
  const hasToolbar =
    showExpandAll || !!toolbar?.hideTerminal || !!toolbar?.start || showSearchInput;
  const showRootAdd = !rootId && addLabel != null && canCreate && !!onCreate;

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
      multiSelect: !!multiSelect,
      canCreate: canCreate && !!onCreate,
      canReorder: !!onMove,
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
      onMove,
      Row,
      multiSelect,
      canCreate,
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
        <MaybeMultiSelect multiSelect={multiSelect} orderedIds={orderedIds}>
          <div className="flex flex-col gap-2xs">
            {hasToolbar && (
              <div
                // eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the sticky toolbar from the tree rows below (no named margin utility)
                className="sticky top-0 z-raised bg-background mb-1 flex items-center gap-xs"
              >
                <div className="flex items-center gap-xs">
                  {showSearchInput && (
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
                <div className="ml-auto flex items-center gap-xs">
                  {showExpandAll && (
                    <ExpandAllButton allExpanded={allExpanded} onToggle={expandAll} />
                  )}
                  {toolbar.hideTerminal && (
                    <ToggleChip
                      active={hideTerminal}
                      variant="ghost"
                      size="sm"
                      onClick={() => setHideTerminal(!hideTerminal)}
                      title={hideTerminal ? "Show completed" : "Hide completed"}
                      icon={
                        hideTerminal ? (
                          <MdFilterAlt className="size-4" />
                        ) : (
                          <MdFilterAltOff className="size-4" />
                        )
                      }
                    >
                      {hideTerminal ? "Completed hidden" : "Hide completed"}
                    </ToggleChip>
                  )}
                </div>
              </div>
            )}
            {multiSelect && <SelectionBar actions={multiSelect.actions} />}
            {visibleTree.map((node) => (
              <Row key={node.id} node={node} depth={0} />
            ))}
            {showRootAdd && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void createAtRoot(null)}
                // eslint-disable-next-line spacing/no-adhoc-spacing -- mt offsets the root Add button from the tree rows above (no named margin utility)
                className="text-muted-foreground mt-1 w-fit"
              >
                <MdAdd className="size-4" />
                {addLabel}
              </Button>
            )}
          </div>
        </MaybeMultiSelect>
      </TreeListProvider>
      <DragOverlay dropAnimation={null}>
        {activeOverlay !== null ? (
          <Text as="div" variant="body" className="bg-background/90 border-accent rounded-md border px-sm py-xs shadow">
            {activeOverlay}
          </Text>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Wraps the rows column in a `MultiSelectProvider` only when multi-select is
 * enabled, so the default tree renders with no provider (and no behavior change).
 */
function MaybeMultiSelect({
  multiSelect,
  orderedIds,
  children,
}: {
  multiSelect: { actions?: ReactNode } | undefined;
  orderedIds: readonly string[];
  children: ReactNode;
}) {
  if (!multiSelect) return <>{children}</>;
  return (
    <MultiSelectProvider orderedIds={orderedIds}>{children}</MultiSelectProvider>
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
