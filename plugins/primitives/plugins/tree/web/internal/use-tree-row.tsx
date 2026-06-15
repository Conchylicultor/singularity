import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  useDraggable,
  useDroppable,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { TreeNode } from "../../core";
import { pendingFocus } from "./pending-focus";
import type { TreeItem } from "./types";

export type TreeListContextValue<T extends TreeItem> = {
  rows: readonly T[];
  selectedId: string | undefined;
  activeId: string | null;
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
  onSelect: (id: string) => void;
  onToggleExpanded: (id: string, next: boolean) => void | Promise<void>;
  onCreate: (args: {
    parentId: string | null;
    rank?: Rank;
  }) => Promise<string | null | undefined>;
  Row: (props: { node: TreeNode<T>; depth: number }) => ReactNode;
  /** True when the tree is in multi-select mode → RowChrome renders a checkbox. */
  multiSelect: boolean;
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
  dragHandleProps: {
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
  const isDragging = ctx.activeId === node.id;
  const shouldAutoFocus = ctx.pendingFocusId === node.id;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: `drag:${node.id}`,
    data: { id: node.id, parentId: node.parentId, rank: node.rank },
  });
  const { isOver: isOverBefore, setNodeRef: setBeforeRef } = useDroppable({
    id: `before:${node.id}`,
    data: { zone: "before" as const, targetId: node.id },
  });
  const { isOver: isOverAfter, setNodeRef: setAfterRef } = useDroppable({
    id: `after:${node.id}`,
    data: { zone: "after" as const, targetId: node.id },
  });
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
    const id = await ctx.onCreate({ parentId: node.id });
    if (!id) return;
    pendingFocus.set(id);
    ctx.onSelect(id);
  }, [ctx, node.id]);

  const addBelow = useCallback(async () => {
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
    const id = await ctx.onCreate({ parentId: node.parentId, rank });
    if (!id) return;
    pendingFocus.set(id);
    ctx.onSelect(id);
  }, [ctx, node.id, node.parentId, node.rank]);

  const dragHandleProps = useMemo(
    () => ({ ref: setDragRef, attributes, listeners }),
    [setDragRef, attributes, listeners],
  );

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
    dragHandleProps,
    beforeRef: setBeforeRef,
    afterRef: setAfterRef,
    childRef: wrappedChildRef,
  };
}
