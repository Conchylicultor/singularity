import type { ReactNode } from "react";
import type { SortingStrategy } from "@plugins/primitives/plugins/sortable-list/web";

/**
 * A top-level draggable content row. `id` is BOTH the dnd sortable id and the
 * key passed back to callbacks (`onDrop`/`onHide`). `node` is opaque, pre-rendered
 * content — the editor never wraps it. Consumers supply already-draggable content:
 * the reorder middleware passes a contribution wrapped by `ReorderItemMiddleware`
 * (which yields a `SortableReorderItem`); the field renderer passes an explicit
 * `SortableReorderItem` around a label chip.
 */
export interface ReorderItemEntry {
  kind: "item";
  id: string;
  /** Pinned non-reorderable (e.g. `excludeFromReorder`): kept out of `sortableIds`. */
  excluded?: boolean;
  node: ReactNode;
}

/**
 * An opaque pre-rendered node — a spacer (leaf) or a container (e.g. a header
 * box). The consumer renders it via the node-type registry and passes the result
 * here; the editor never builds node UI.
 *
 * `memberIds` is present ONLY for container nodes, so the shared
 * `SortableContext` registers the child ids that live inside the node. A
 * container pushes ONLY its `memberIds` (it is NOT top-level draggable in this
 * pass — no own sortable id). A leaf node (e.g. a spacer) omits `memberIds`, so
 * it pushes its own `id` and is itself sortable.
 */
export interface ReorderNodeEntry {
  kind: "node";
  id: string;
  node: ReactNode;
  /** Sortable child ids — present only for container nodes. */
  memberIds?: string[];
}

export type ReorderEntry = ReorderItemEntry | ReorderNodeEntry;

export interface ReorderEditorProps {
  /** Top-level display order (items + pre-rendered nodes). */
  entries: ReorderEntry[];
  /** Hidden items, surfaced in the restore popover. */
  hiddenItems: Array<{ key: string; label: string }>;

  // --- core callbacks (always present) ---
  onDrop: (draggedId: string, overId: string) => void;
  onHide: (id: string) => void;
  onRestore: (key: string) => void;
  /** Registry-driven insert affordances (e.g. "Add Spacer"), shown in the
   *  RestoreButton popover. The `create()` half is consumer-side; `onInsert`
   *  is opaque to the editor. */
  inserts: Array<{ label: string; onInsert: () => void }>;
  /** Generic remove for a node by id (e.g. the spacer's × button). */
  onRemoveNode: (id: string) => void;

  // --- display ---
  editMode: boolean;
  orientation?: "horizontal" | "vertical";
  strategy?: SortingStrategy;
  /**
   * Render the items inside an editor-owned `flex flex-wrap` container so a
   * horizontal row wraps onto multiple lines instead of overflowing. Used only
   * when the HOST does not already own wrapping — NEVER with a CollapsibleWrap
   * host (whose child-measurement would break on an interposed wrapper div).
   * Pair with `strategy={rectSortingStrategy}` for correct 2-D drag.
   */
  wrap?: boolean;
  /** Active-drag overlay (e.g. a floating contribution card). Omit → no overlay. */
  renderOverlay?: (activeId: string) => ReactNode;
}
