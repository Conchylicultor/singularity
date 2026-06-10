import { createContext } from "react";

/**
 * Per-area override of the global `useEditMode()` signal.
 *
 * `null` (default) → consumers read the global edit-mode signal as usual.
 * `false` → force display-only: items render non-draggable (no ring/×/placeholder,
 *   no `useSortable`) and group boxes drop their edit chrome. The list middleware
 *   provides `false` around its INLINE render in the constrained "popover" regime,
 *   where editing happens in a separate popover-hosted editor and the inline view
 *   must stay clean (and must NOT mount a `SortableContext`).
 *
 * Internal to `reorder/web` — consumed by `ReorderItemMiddleware` and
 * `ReorderGroupBox`. Never exported from the plugin barrel.
 */
export const ReorderEffectiveEditModeContext = createContext<boolean | null>(
  null,
);
