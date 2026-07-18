import {
  createContext,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import {
  useDroppable,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useRankReorderItem } from "@plugins/primitives/plugins/rank-reorder/web";
import { useRevealOnActive } from "@plugins/primitives/plugins/scroll-reveal/web";
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
    afterId?: string;
  }) => Promise<string | null | undefined>;
  Row: (props: { node: TreeNode<T>; depth: number }) => ReactNode;
  /**
   * One-shot per TreeList instance: returns `true` the first time it is called
   * (the tree's initial mount) and `false` forever after. Drives the row's
   * mount-time reveal so a deep-linked selection below the fold is scrolled into
   * view exactly once, while incidental row REmounts stay inert.
   */
  takeInitialReveal: () => boolean;
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

  // Reveal the row on a false→true selection transition only — never on a
  // remount that happens to be already-selected (background live-state churn).
  // The one legitimate mount-reveal (a tree first appearing with a deep-linked
  // selection below the fold) is preserved via the per-instance one-shot.
  const setRevealRef = useRevealOnActive(isSelected, {
    revealOnMount: ctx.takeInitialReveal,
  });
  const wrappedChildRef = useCallback(
    (el: HTMLElement | null) => {
      setRevealRef(el);
      setChildRef(el);
    },
    [setRevealRef, setChildRef],
  );

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

  // Positional intent only. `ctx.rows` may be a *filtered projection* of a
  // shared ordering space (the pages sidebar sees only `type='page'` rows of the
  // `page_blocks` forest), so a rank minted here over the visible siblings can
  // collide with an invisible one. The consumer's endpoint resolves `afterId`
  // against the complete sibling set.
  const addBelow = useCallback(async () => {
    const create = ctx.onCreate;
    if (!create) return;
    const id = await create({ parentId: node.parentId, afterId: node.id });
    if (!id) return;
    pendingFocus.set(id);
    ctx.onSelect(id);
  }, [ctx, node.id, node.parentId]);

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
