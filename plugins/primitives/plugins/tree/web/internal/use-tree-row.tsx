import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  useDroppable,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { useRankReorderItem } from "@plugins/primitives/plugins/rank-reorder/web";
import { useRevealOnActive } from "@plugins/primitives/plugins/scroll-reveal/web";
import type { ExpandChange, TreeNode } from "../../core";
import { pendingFocus } from "./pending-focus";
import type { TreeItem } from "./types";

export type TreeListContextValue<T extends TreeItem> = {
  rows: readonly T[];
  selectedId: string | undefined;
  pendingFocusId: string | null;
  clearPendingFocus: () => void;
  onSelect: (id: string) => void;
  /** Batched expand write (see `TreeListProps.setExpanded`) — a single-row
   *  toggle wraps itself in a 1-element array. */
  setExpanded: (changes: readonly ExpandChange[]) => void | Promise<void>;
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
  /** Activating (body-clicking) a matching row toggles its expansion instead of
   *  selecting it (see `TreeListProps.expandOnActivate`). Absent → every row
   *  selects, today's behavior. */
  expandOnActivate?: (row: T) => boolean;
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

/**
 * Non-throwing read of the tree context: `null` outside a `<TreeList>`. The
 * primitive form — a component that may be rendered by a NON-tree surface (a
 * per-item action contributed to every view of a DataView, say) can only ask
 * "am I inside a tree?" if asking is legal outside one.
 */
export function useOptionalTreeListContext<
  T extends TreeItem = TreeItem,
>(): TreeListContextValue<T> | null {
  const ctx = useContext(TreeListContext);
  return ctx === null ? null : (ctx as TreeListContextValue<T>);
}

export function useTreeListContext<
  T extends TreeItem = TreeItem,
>(): TreeListContextValue<T> {
  const ctx = useOptionalTreeListContext<T>();
  if (!ctx) {
    throw new Error("useTreeListContext must be used inside <TreeList>");
  }
  return ctx;
}

/** Stable element-type wrapper for one tree row. Its identity is constant, so a
 *  row reconciles in place across renders for a stable key — an unstable `Row`
 *  prop can no longer cause the whole row subtree to remount on background
 *  live-state churn. Invokes the current `ctx.Row` as a function (not `<Row/>`),
 *  so the returned row body (a stable module type) is the reconciliation unit;
 *  per-node hook isolation is preserved because each TreeRowSlot is keyed. */
export function TreeRowSlot<T extends TreeItem>({
  node,
  depth,
}: {
  node: TreeNode<T>;
  depth: number;
}): ReactNode {
  // Lowercase local so the React Compiler / eslint capitalized-call heuristics
  // don't treat this call as a component invocation.
  const render = useTreeListContext<T>().Row;
  return <>{render({ node, depth })}</>;
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

// Published by `RowChrome` around the row it paints, so anything rendered INTO
// that row (a per-item action, say) can reach the row's own controls without
// being handed the node. Not generic in `T`: `RowControls` carries no row data,
// only the node's own affordances, so no consumer needs the row type.
const RowControlsContext = createContext<RowControls | null>(null);

export function RowControlsProvider({
  value,
  children,
}: {
  value: RowControls;
  children: ReactNode;
}) {
  return (
    <RowControlsContext.Provider value={value}>
      {children}
    </RowControlsContext.Provider>
  );
}

/**
 * Non-throwing read of the enclosing tree row's controls: `null` outside a tree
 * row. Same rule as `useOptionalTreeListContext` — a per-item action contributed
 * to a DataView renders in EVERY view (list / table / gallery / tree), so a
 * row-control consumer can only ask "am I inside a tree row?" if asking is legal
 * outside one. Such an action should `return null` when the controls are absent.
 */
export function useOptionalRowControls(): RowControls | null {
  return useContext(RowControlsContext);
}

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

  const toggleExpanded = useCallback(
    () => void ctx.setExpanded([{ id: node.id, expanded: !isOpen }]),
    [ctx, node.id, isOpen],
  );
  // The `expandOnActivate` branch lives HERE, not at the `onSelect` seam, and
  // that placement is load-bearing: `ctx.onSelect` is also called
  // PROGRAMMATICALLY — by `createAtRoot` (tree-list.tsx), by `addChild` /
  // `addBelow` below, and by the reveal path — and every one of those must keep
  // navigating to the row it just created or revealed. Only a real body click
  // routes through `select`, so only `select` may divert the gesture to a toggle.
  const select = useCallback(() => {
    if (ctx.expandOnActivate?.(node)) {
      toggleExpanded();
      return;
    }
    ctx.onSelect(node.id);
  }, [ctx, node, toggleExpanded]);
  const consumeAutoFocus = useCallback(
    () => ctx.clearPendingFocus(),
    [ctx],
  );

  const addChild = useCallback(async () => {
    const create = ctx.onCreate;
    if (!create) return;
    const id = await create({ parentId: node.id });
    if (!id) return;
    // Reveal the new child by expanding THIS row directly, rather than leaning on
    // the reveal-on-select effect: `onSelect` is a no-op until the created row
    // lands in `rows` (a live-state round-trip), so on a collapsed folder the
    // child would be created invisibly. Expanding the parent needs no round-trip.
    await ctx.setExpanded([{ id: node.id, expanded: true }]);
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

  // Memoized, not a fresh literal per render: `RowChrome` publishes this object
  // as the `RowControlsContext` value, and a context value that churns every
  // render re-renders every consumer inside the row on unrelated tree churn.
  // Every member below is already stable on its own (primitives, `useCallback`
  // handlers, dnd-kit's memoized refs), so the identity now changes only when
  // the row genuinely changes.
  return useMemo(
    () => ({
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
    }),
    [
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
      setBeforeRef,
      setAfterRef,
      wrappedChildRef,
    ],
  );
}
