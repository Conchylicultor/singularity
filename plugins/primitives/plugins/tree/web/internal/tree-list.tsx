import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MdAdd } from "react-icons/md";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import { type DragEndEvent } from "@dnd-kit/core";
import { RankReorderDndContext } from "@plugins/primitives/plugins/rank-reorder/web";
import {
  buildTree,
  isDescendant,
  resolveDropParent,
  type DropZone,
  type ExpandChange,
  type TreeNode,
} from "../../core";
import {
  SearchInput,
  filterTree,
} from "@plugins/primitives/plugins/search/web";
import {
  MultiSelectProvider,
  SelectionBar,
} from "@plugins/primitives/plugins/multi-select/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { VirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import { pendingFocus } from "./pending-focus";
import { TreeListProvider, TreeRowSlot } from "./use-tree-row";
import type { TreeItem } from "./types";

/** Above this many *visible* (expanded) rows the tree windows its rows via
 * VirtualRows. Below it the recursive render runs unchanged. Mirrors the list
 * view's threshold. */
const VIRTUALIZE_THRESHOLD = 100;
/** Initial per-row height estimate (min-h-7 row + py-xs). Dynamic measurement
 * refines it after mount. */
const ROW_ESTIMATE_PX = 32;

export type TreeListProps<T extends TreeItem> = {
  rows: readonly T[];
  selectedId?: string;
  rootId?: string;
  onSelect: (id: string) => void;
  /**
   * Apply a whole batch of expand/collapse changes. Batch-shaped on purpose: a
   * single gesture (expand-all, the reveal-on-select ancestor walk, a drop into
   * a collapsed folder) touches N rows, and every layer below must apply them in
   * ONE update rather than N. Passing `[]` is legal and does nothing.
   */
  setExpanded: (changes: readonly ExpandChange[]) => void | Promise<void>;
  /**
   * DnD reorder/reparent. Omit for a read-only tree — the drag handle disappears.
   * The destination is positional INTENT and carries no rank: `targetId`/`zone`
   * name the drop neighbour and side, with `targetId: null` + `"after"` meaning
   * "append at the end of `dest.parentId`'s children" (what the `child` reparent
   * zone resolves to). `rows` is a projection of a shared ordering space, so the
   * rank is the server's to mint against the complete sibling set
   * (`rankAdjacentTo`) — see the rank primitive's CLAUDE.md.
   */
  onMove?: (
    id: string,
    dest: {
      parentId: string | null;
      targetId: string | null;
      zone: "before" | "after";
    },
  ) => void | Promise<void>;
  /** Create child/sibling. Omit for a read-only tree — every Add affordance disappears.
   * `afterId` is positional intent (place the new row right after that sibling). */
  onCreate?: (args: {
    parentId: string | null;
    afterId?: string;
  }) => Promise<string | null | undefined>;
  /** The component used to render every row. Recursion through children is
   * handled by RowChrome (which reads this from context). */
  Row: (props: { node: TreeNode<T>; depth: number }) => ReactNode;
  /** Content shown in the floating chip while a row is being dragged. */
  dragOverlay?: (row: T) => ReactNode;
  toolbar?: {
    expandAll?: boolean;
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
   * Activating (body-clicking) a matching row toggles its expansion instead of
   * selecting it — the "click a folder to open it" affordance. Stateless by
   * construction: it only routes the gesture, the expand value still lives in
   * `rows[].expanded` and is written through `setExpanded`. Absent → every row
   * selects, today's behavior.
   */
  expandOnActivate?: (row: T) => boolean;
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
    setExpanded,
    onMove,
    onCreate,
    Row,
    dragOverlay,
    toolbar,
    addLabel = "Add",
    canCreate = true,
    expandOnActivate,
    multiSelect,
  } = props;

  const [pendingFocusId, setPendingFocusId] = useState<string | null>(() =>
    pendingFocus.take(),
  );
  const clearPendingFocus = useCallback(() => setPendingFocusId(null), []);

  // One-shot per TreeList mount: the first row to read it (the initially
  // selected one) gets its mount-reveal; every later reader — incidental row
  // remounts from live-state churn — reads false and stays put.
  const initialReveal = useRef(true);
  const takeInitialReveal = useCallback(() => {
    const v = initialReveal.current;
    initialReveal.current = false;
    return v;
  }, []);

  const createAtRoot = useCallback(
    async (parentId: string | null) => {
      if (!onCreate) return;
      const id = await onCreate({ parentId });
      if (!id) return;
      pendingFocus.set(id);
      setPendingFocusId(id);
      onSelect(id);
    },
    [onCreate, onSelect],
  );

  // `rows[].expanded` is read straight through — no optimistic overlay. `setExpanded`
  // has exactly one sink (the DataView host's `useViewEphemeral.setExpanded`, a
  // synchronous `setState` batched into the same commit as the click) and cannot
  // fail, so a click's new value is already in `rows` on the very next render.
  // The overlay existed only for the deleted `HierarchyConfig.onToggleExpanded`,
  // an async, failable write that could leave the chevron stale until a server push.
  const scoped = useMemo(
    () => (rootId ? filterSubtree(rows, rootId) : [...rows]),
    [rows, rootId],
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

  const visibleTree = afterSearch;

  // Flattened DFS of the painted tree: each visible row in paint order with its
  // depth, descending into a node's children only when expanded. Drives both the
  // windowed render (VirtualRows items) and — via orderedIds — MultiSelect
  // shift-range ordering, so the two never diverge.
  const flatVisible = useMemo(() => {
    const out: { node: TreeNode<T>; depth: number }[] = [];
    const walk = (nodes: TreeNode<T>[], depth: number) => {
      for (const node of nodes) {
        out.push({ node, depth });
        if (node.expanded) walk(node.children, depth + 1);
      }
    };
    walk(visibleTree, 0);
    return out;
  }, [visibleTree]);
  const orderedIds = useMemo(
    () => flatVisible.map((f) => f.node.id),
    [flatVisible],
  );

  const windowed = flatVisible.length > VIRTUALIZE_THRESHOLD;
  const selectedIndex = useMemo(() => {
    if (!windowed || !selectedId) return undefined;
    const i = flatVisible.findIndex((f) => f.node.id === selectedId);
    return i >= 0 ? i : undefined;
  }, [windowed, selectedId, flatVisible]);

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
    await setExpanded(
      nodesWithChildren
        .filter((r) => r.expanded !== next)
        .map((r) => ({ id: r.id, expanded: next })),
    );
  }, [nodesWithChildren, allExpanded, setExpanded]);

  // The DnD shell (DndContext, sensors, active-id lifecycle, DragOverlay chip,
  // and the windowed measuring strategy) is lifted into `RankReorderDndContext`.
  // The tree supplies only its drop *resolution* (onDragEnd, below — which keeps
  // the `child`-zone reparent + isDescendant cycle guard) and the chip content.
  const dragChip = useCallback(
    (id: string) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      return dragOverlay ? dragOverlay(row) : "Item";
    },
    [rows, dragOverlay],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!onMove) return;
      const { active, over } = event;
      if (!over) return;
      const draggedId = active.data.current?.id as string | undefined;
      const zone = over.data.current?.zone as DropZone | undefined;
      const targetId = over.data.current?.targetId as string | undefined;
      if (!draggedId || !zone || !targetId) return;
      if (draggedId === targetId) return;
      if (isDescendant(rows, draggedId, targetId)) return;
      const dest = resolveDropParent(rows, draggedId, zone, targetId);
      if (!dest) return;
      // No "already there" short-circuit: under a filtered projection that is
      // not decidable here. Two rows adjacent in `rows` can have invisible
      // siblings between them in storage, so a drop that looks like a no-op is
      // a real reposition. The server resolves the anchor against the complete
      // sibling set and is free to mint the rank the row already holds.
      //
      // A drop into a COLLAPSED destination parent would make the dragged row
      // vanish: a drag never changes `selectedRowId`, so the reveal-on-select
      // effect below never runs for a reparent. Open the destination in its own
      // batched write (idempotent — a redundant expand of an already-open folder
      // is a no-op we skip anyway).
      const destParent =
        dest.parentId === null
          ? undefined
          : rows.find((r) => r.id === dest.parentId);
      if (destParent && !destParent.expanded) {
        void setExpanded([{ id: destParent.id, expanded: true }]);
      }
      // A `child` drop reparents under the target and lands last, which as
      // neighbour intent is "after the end of the parent's child list" — i.e. a
      // null target.
      void onMove(draggedId, {
        ...dest,
        targetId: zone === "child" ? null : targetId,
        zone: zone === "child" ? "after" : zone,
      });
    },
    [rows, onMove, setExpanded],
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
    // Collect the whole collapsed-ancestor chain first, then write it ONCE —
    // the walk is one gesture, not one gesture per ancestor.
    const changes: ExpandChange[] = [];
    let cur = byId.get(selectedId)!.parentId;
    while (cur) {
      const parent = byId.get(cur);
      if (!parent) break;
      if (!parent.expanded) changes.push({ id: cur, expanded: true });
      cur = parent.parentId;
    }
    if (changes.length === 0) return;
    // reveal-on-select: expands the collapsed ancestors of selectedId in one batched call so the row is visible; `setExpanded` writes the host's expand map, so it is a controlled imperative side-effect, not derivable in render; the walk needs the full rows map and is gated idempotent by the lastRevealedId ref to avoid re-running
    void setExpanded(changes);
  }, [selectedId, rows, setExpanded]);

  const showSearchInput = !!toolbar?.search && !hideSearchInput;
  const hasToolbar = showExpandAll || !!toolbar?.start || showSearchInput;
  const showRootAdd = !rootId && addLabel != null && canCreate && !!onCreate;

  const ctxValue = useMemo(
    () => ({
      rows,
      selectedId,
      pendingFocusId,
      clearPendingFocus,
      onSelect,
      setExpanded,
      onCreate,
      Row,
      takeInitialReveal,
      expandOnActivate,
      multiSelect: !!multiSelect,
      canCreate: canCreate && !!onCreate,
      canReorder: !!onMove,
      windowed,
    }),
    [
      rows,
      selectedId,
      pendingFocusId,
      clearPendingFocus,
      onSelect,
      setExpanded,
      onCreate,
      Row,
      takeInitialReveal,
      expandOnActivate,
      multiSelect,
      canCreate,
      onMove,
      windowed,
    ],
  );

  return (
    <RankReorderDndContext
      onDragEnd={onDragEnd}
      dragOverlay={dragChip}
      // In windowed mode rows mount/unmount as the user scrolls; the shell's
      // MeasuringStrategy.Always re-measures droppables each frame so freshly
      // mounted rows become valid drop targets mid-drag.
      measuringAlways={windowed}
    >
      {(activeId) => (
        <TreeListProvider value={ctxValue}>
          <MaybeMultiSelect multiSelect={multiSelect} orderedIds={orderedIds}>
            <Stack gap="2xs">
              {hasToolbar && (
                // eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the sticky toolbar from the tree rows below (no named margin utility)
                <Sticky mask className="mb-1">
                  <Stack
                    direction="row"
                    gap="xs"
                    align="center"
                    justify="between"
                  >
                    <Stack direction="row" gap="xs" align="center">
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
                    </Stack>
                    <Stack direction="row" gap="xs" align="center">
                      {showExpandAll && (
                        <ExpandAllButton
                          allExpanded={allExpanded}
                          onToggle={expandAll}
                        />
                      )}
                    </Stack>
                  </Stack>
                </Sticky>
              )}
              {multiSelect && <SelectionBar actions={multiSelect.actions} />}
              {windowed ? (
                <VirtualRows
                  items={flatVisible}
                  estimateSize={ROW_ESTIMATE_PX}
                  getKey={(item) => item.node.id}
                  scrollToIndex={selectedIndex}
                  // Pin the drag source so it stays mounted when scrolled out of
                  // the window — otherwise its draggable unregisters mid-gesture
                  // and dnd-kit cancels the drop.
                  keepMounted={activeId ? [activeId] : undefined}
                >
                  {(item) => (
                    <TreeRowSlot node={item.node} depth={item.depth} />
                  )}
                </VirtualRows>
              ) : (
                visibleTree.map((node) => (
                  <TreeRowSlot key={node.id} node={node} depth={0} />
                ))
              )}
              {showRootAdd && (
                <Button
                  variant="ghost"
                  onClick={() => void createAtRoot(null)}
                  // eslint-disable-next-line spacing/no-adhoc-spacing -- mt offsets the root Add button from the tree rows above (no named margin utility)
                  className="text-muted-foreground mt-1 w-fit"
                >
                  <MdAdd className="size-4" />
                  {addLabel}
                </Button>
              )}
            </Stack>
          </MaybeMultiSelect>
        </TreeListProvider>
      )}
    </RankReorderDndContext>
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
    <MultiSelectProvider orderedIds={orderedIds}>
      {children}
    </MultiSelectProvider>
  );
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
