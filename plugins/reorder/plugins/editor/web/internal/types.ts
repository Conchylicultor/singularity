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

export interface ReorderSpacerEntry {
  kind: "spacer";
  /** Spacer uuid; the editor renders the `SpacerReorderItem` itself. */
  id: string;
}

/**
 * A pre-rendered group box (middleware-only; groups stay DB-backed). The editor
 * does not build group UI — the consumer injects a ready group element via `node`
 * and tells the editor which sortable ids live inside it (`memberIds`) so the
 * shared `SortableContext` registers them.
 */
export interface ReorderGroupEntry {
  kind: "group";
  id: string;
  memberIds: string[];
  node: ReactNode;
}

export type ReorderEntry =
  | ReorderItemEntry
  | ReorderSpacerEntry
  | ReorderGroupEntry;

export interface ReorderEditorProps {
  /** Top-level display order (items, spacers, optional pre-rendered groups). */
  entries: ReorderEntry[];
  /** Hidden items, surfaced in the restore popover. */
  hiddenItems: Array<{ key: string; label: string }>;

  // --- core callbacks (always present) ---
  onDrop: (draggedId: string, overId: string) => void;
  onHide: (id: string) => void;
  onRestore: (key: string) => void;
  onAddSpacer: () => void;
  onDeleteSpacer: (id: string) => void;

  // --- optional group callbacks (middleware only) ---
  onGroupCreate?: (draggedId: string, targetId: string) => void;
  onGroupJoin?: (draggedId: string, groupId: string) => void;
  onGroupReorder?: (groupId: string, overId: string) => void;
  onAddGroup?: () => void;

  // --- display ---
  editMode: boolean;
  orientation?: "horizontal" | "vertical";
  strategy?: SortingStrategy;
  /** Active-drag overlay (e.g. a floating contribution card). Omit → no overlay. */
  renderOverlay?: (activeId: string) => ReactNode;
}
