import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  MdAdd,
  MdFilterAlt,
  MdFilterAltOff,
  MdUnfoldLess,
  MdUnfoldMore,
} from "react-icons/md";
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
import { generateKeyBetween } from "fractional-indexing";
import {
  buildTree,
  computeDrop,
  isDescendant,
  type DropZone,
  type TreeNode,
} from "../../shared";
import { cn } from "@/lib/utils";
import { TreeRow, type RowMenuItem } from "./tree-row";
import { pendingFocus } from "./pending-focus";
import type { RowContext, TreeItem } from "./types";

export type { RowContext, TreeItem } from "./types";
export type { RowMenuItem } from "./tree-row";

export type TreeListProps<T extends TreeItem> = {
  rows: readonly T[];
  selectedId?: string;
  rootId?: string;
  labelOf: (row: T) => string;
  onSelect: (id: string) => void;
  onRename: (id: string, next: string) => void | Promise<void>;
  onToggleExpanded: (id: string, next: boolean) => void | Promise<void>;
  onMove: (
    id: string,
    dest: { parentId: string | null; rank: string },
  ) => void | Promise<void>;
  onCreate: (args: {
    parentId: string | null;
    rank?: string;
  }) => Promise<string | null | undefined>;
  renderLeading?: (row: T) => ReactNode;
  renderActions?: (row: T, ctx: RowContext) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
  rowMenu?: (
    row: T,
    helpers: { addBelow: (id: string) => void },
  ) => RowMenuItem[];
  toolbar?: {
    expandAll?: boolean;
    hideTerminal?: { isTerminal: (row: T) => boolean };
  };
  // Root-level "Add" button. Pass `null` to hide (e.g. when scoped to a subtree).
  addLabel?: string | null;
};

export function TreeList<T extends TreeItem>(props: TreeListProps<T>) {
  const {
    rows,
    selectedId,
    rootId,
    labelOf,
    onSelect,
    onRename,
    onToggleExpanded,
    onMove,
    onCreate,
    renderLeading,
    renderActions,
    rowClassName,
    rowMenu,
    toolbar,
    addLabel = "Add",
  } = props;

  const [hideTerminal, setHideTerminal] = useState(true);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(() =>
    pendingFocus.take(),
  );

  const create = useCallback(
    async (parentId: string | null, rank?: string) => {
      const id = await onCreate({ parentId, rank });
      if (!id) return;
      pendingFocus.set(id);
      onSelect(id);
    },
    [onCreate, onSelect],
  );

  const addBelow = useCallback(
    async (nodeId: string) => {
      const node = rows.find((r) => r.id === nodeId);
      if (!node) return;
      const siblings = rows
        .filter((r) => r.parentId === node.parentId)
        .sort((a, b) => a.rank.localeCompare(b.rank));
      const idx = siblings.findIndex((s) => s.id === nodeId);
      const next = siblings[idx + 1];
      let rank: string;
      try {
        rank = generateKeyBetween(node.rank, next?.rank ?? null);
      } catch {
        rank = generateKeyBetween(node.rank, null);
      }
      await create(node.parentId, rank);
    },
    [rows, create],
  );

  const scoped = useMemo(
    () => (rootId ? filterSubtree(rows, rootId) : [...rows]),
    [rows, rootId],
  );
  const tree = useMemo(() => buildTree(scoped), [scoped]);
  const isTerminal = toolbar?.hideTerminal?.isTerminal;
  const visibleTree = useMemo(
    () =>
      hideTerminal && isTerminal ? hideTerminalSubtrees(tree, isTerminal) : tree,
    [tree, hideTerminal, isTerminal],
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
        .map((r) => onToggleExpanded(r.id, next)),
    );
  }, [nodesWithChildren, allExpanded, onToggleExpanded]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeLabel = useMemo(() => {
    if (!activeId) return null;
    const row = rows.find((r) => r.id === activeId);
    return row ? labelOf(row) : null;
  }, [activeId, rows, labelOf]);

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
        current.rank === dest.rank
      ) {
        return;
      }
      void onMove(draggedId, dest);
    },
    [rows, onMove],
  );

  const hasToolbar = showExpandAll || !!toolbar?.hideTerminal;
  const showRootAdd = !rootId && addLabel != null;
  const boundRowMenu = rowMenu
    ? (row: T) => rowMenu(row, { addBelow })
    : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col gap-0.5">
        {hasToolbar && (
          <div className="mb-1 flex items-center justify-end gap-1">
            {showExpandAll && (
              <button
                type="button"
                onClick={expandAll}
                title={allExpanded ? "Collapse all" : "Expand all"}
                aria-label={allExpanded ? "Collapse all" : "Expand all"}
                className="hover:bg-accent text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded"
              >
                {allExpanded ? (
                  <MdUnfoldLess className="size-4" />
                ) : (
                  <MdUnfoldMore className="size-4" />
                )}
              </button>
            )}
            {toolbar?.hideTerminal && (
              <button
                type="button"
                onClick={() => setHideTerminal((v) => !v)}
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
        )}
        {visibleTree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            activeId={activeId}
            labelOf={labelOf}
            onSelect={onSelect}
            onRename={onRename}
            onToggleExpanded={onToggleExpanded}
            onAddChild={(pid) => create(pid)}
            renderLeading={renderLeading}
            renderActions={renderActions}
            rowClassName={rowClassName}
            rowMenu={boundRowMenu}
            pendingFocusId={pendingFocusId}
            clearPendingFocus={() => setPendingFocusId(null)}
          />
        ))}
        {showRootAdd && (
          <button
            type="button"
            onClick={() => create(null)}
            className="text-muted-foreground hover:bg-accent hover:text-foreground mt-1 flex w-fit items-center gap-1 rounded px-2 py-1 text-sm"
          >
            <MdAdd className="size-4" />
            {addLabel}
          </button>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeLabel !== null ? (
          <div className="bg-background/90 border-accent rounded border px-2 py-1 text-sm shadow">
            {activeLabel || "Untitled"}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function hideTerminalSubtrees<T extends TreeItem>(
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
