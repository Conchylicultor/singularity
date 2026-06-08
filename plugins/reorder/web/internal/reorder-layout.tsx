import { createContext } from "react";
import type { SortingStrategy } from "@plugins/primitives/plugins/sortable-list/web";

/**
 * Layout-specific decisions a layout owner (e.g. CollapsibleWrap) can inject
 * into the reorder middleware. When no provider is present the middleware falls
 * back to today's 1-D behavior (orientation→strategy mapping) byte-for-byte.
 *
 * Only the sorting strategy is injectable: a 2-D wrap layout needs dnd-kit's
 * `rectSortingStrategy` so chips drag correctly across wrapped rows. The spacer
 * and collision detection stay identical across layouts — a spacer is the same
 * `flex-1` push element whether the row wraps or not.
 */
export interface ReorderLayout {
  /** dnd-kit sorting strategy (e.g. rectSortingStrategy for 2-D wrap). */
  strategy: SortingStrategy;
}

/**
 * Null everywhere except inside a layout owner's provider. The reorder
 * middleware reads it to pick the sorting strategy; a null context is
 * byte-for-byte today's single-axis behavior.
 */
export const ReorderLayoutContext = createContext<ReorderLayout | null>(null);
