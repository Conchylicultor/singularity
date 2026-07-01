import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  useDroppable,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useRankReorderItem } from "@plugins/primitives/plugins/rank-reorder/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { TreeNode } from "../../core";
import { pendingFocus } from "./pending-focus";
import type { TreeItem } from "./types";

export type TreeListContextValue<T extends TreeItem> = {
  rows: readonly T[];
  selectedId: string | undefined;
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
  onSelect: (id: string) => void;
  onToggleExpanded: (id: string, next: boolean) => void | Promise<void>;
  /** Omitted for a read-only tree — `canCreate` is then false and Add disappears. */
  onCreate?: (args: {
    parentId: string | null;
    rank?: Rank;
  }) => Promise<string | null | undefined>;
  Row: (props: { node: TreeNode<T>; depth: number }) => ReactNode;
  /** True when the tree is in multi-select mode → RowChrome renders a checkbox. */
  multiSelect: boolean;
  /** True when `onCreate` is wired → RowChrome renders root + per-node Add. */
  canCreate: boolean;
  /** True when `onMove` is wired → RowChrome renders the drag handle. */
  canReorder: boolean;
  /** True when TreeList renders rows through VirtualRows; RowChrome then skips its own child recursion. */
  windowed: boolean;
};

// The context is invariant in T at the React level; we cast through `unknown`
// at the boundary so each consumer sees its own concrete row type.
const TreeListContext = createContext<unknown>(null);

export function TreeListProvider<T extends TreeItem>({
  value,
  children,
}: {
  value: TreeListContextValue<T>;
  children: ReactNode;
}) {
  return (
    <TreeListContext.Provider value={value}>
      {children}
    </TreeListContext.Provider>
  );
}

export function useTreeListContext<
  T extends TreeItem = TreeItem,
>(): TreeListContextValue<T> {
  const ctx = useContext(TreeListContext);
  if (!ctx) {
    throw new Error("useTreeListContext must be used inside <TreeList>");
  }
  return ctx as TreeListContextValue<T>;
}

export type RowControls = {
  isSelected: boolean;
  isDragging: boolean;
  isOpen: boolean;
  hasChildren: boolean;
  isOverChild: boolean;
  isOverBefore: boolean;
  isOverAfter: boolean;
  shouldAutoFocus: boolean;
  consumeAutoFocus: () => void;
  select: () => void;
  toggleExpanded: () => void;
  addChild: () => Promise<void>;
  addBelow: () => Promise<void>;
  /**
   * The whole row is the drag source (Notion-style: no separate grip handle).
   * RowChrome merges `ref` with `childRef` onto the row element and spreads
   * `attributes`/`listeners` onto it.
   */
  dragSource: {
    ref: (el: HTMLElement | null) => void;
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
  };
  beforeRef: (el: HTMLElement | null) => void;
  afterRef: (el: HTMLElement | null) => void;
  childRef: (el: HTMLElement | null) => void;
};

export function useTreeRow<T extends TreeItem>(
  node: TreeNode<T>,
): RowControls {
  const ctx = useTreeListContext<T>();
  const isOpen = node.expanded;
  const hasChildren = node.children.length > 0;
  const isSelected = ctx.selectedId === node.id;
  const shouldAutoFocus = ctx.pendingFocusId === node.id;

  // The drag source + before/after sibling zones come from the shared
  // rank-reorder primitive (same `{ id, rank }` / `{ zone, targetId }` data
  // contract the tree's onDragEnd reads). The `child` (reparent) zone stays
  // tree-local — only the tree has a hierarchy to nest into.
  const {
    dragSource,
    isDragging,
    beforeRef: setBeforeRef,
    afterRef: setAfterRef,
    isOverBefore,
    isOverAfter,
  } = useRankReorderItem(node.id, node.rank);
  const { isOver: isOverChild, setNodeRef: setChildRef } = useDroppable({
    id: `child:${node.id}`,
    data: { zone: "child" as const, targetId: node.id },
  });

  const scrollRef = useRef<HTMLElement | null>(null);
  const wrappedChildRef = useCallback(
    (el: HTMLElement | null) => {
      scrollRef.current = el;
      setChildRef(el);
    },
    [setChildRef],
  );

  useEffect(() => {
    if (isSelected && scrollRef.current) {
      scrollRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  const select = useCallback(() => ctx.onSelect(node.id), [ctx, node.id]);
  const toggleExpanded = useCallback(
    () => void ctx.onToggleExpanded(node.id, !isOpen),
    [ctx, node.id, isOpen],
  );
  const consumeAutoFocus = useCallback(
    () => ctx.clearPendingFocus(),
    [ctx],
  );

  const addChild = useCallback(async () => {
    const create = ctx.onCreate;
    if (!create) return;
    const id = await create({ parentId: node.id });
    if (!id) return;
    pendingFocus.set(id);
    ctx.onSelect(id);
  }, [ctx, node.id]);

  const addBelow = useCallback(async () => {
    const create = ctx.onCreate;
    if (!create) return;
    const siblings = ctx.rows
      .filter((r) => r.parentId === node.parentId)
      .sort((a, b) => Rank.compare(a.rank, b.rank));
    const idx = siblings.findIndex((s) => s.id === node.id);
    const next = siblings[idx + 1];
    let rank: Rank;
    try {
      rank = Rank.between(node.rank, next?.rank ?? null);
    // eslint-disable-next-line promise-safety/no-bare-catch -- Rank.between throws a plain Error when neighbor rank is invalid/exhausted; fallback to open-ended insertion after node is the correct recovery
    } catch {
      rank = Rank.between(node.rank, null);
    }
    const id = await create({ parentId: node.parentId, rank });
    if (!id) return;
    pendingFocus.set(id);
    ctx.onSelect(id);
  }, [ctx, node.id, node.parentId, node.rank]);

  return {
    isSelected,
    isDragging,
    isOpen,
    hasChildren,
    isOverChild,
    isOverBefore,
    isOverAfter,
    shouldAutoFocus,
    consumeAutoFocus,
    select,
    toggleExpanded,
    addChild,
    addBelow,
    dragSource,
    beforeRef: setBeforeRef,
    afterRef: setAfterRef,
    childRef: wrappedChildRef,
  };
}
