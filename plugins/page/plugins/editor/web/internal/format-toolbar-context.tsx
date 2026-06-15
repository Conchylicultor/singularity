import { createContext, useContext } from "react";
import type { LexicalEditor } from "lexical";
import type { ColorToken, Mark } from "../../core";

/**
 * Shared state for the floating format toolbar. A single owner
 * (`FormatToolbarPlugin`) recomputes the selection snapshot on every selection
 * change and publishes it here; each `Editor.FormatAction` button just reads the
 * snapshot and dispatches commands through `editor`. Buttons never register their
 * own selection listeners — the snapshot is computed once.
 */
export interface FormatToolbarValue {
  /** The Lexical editor that owns the current selection. */
  editor: LexicalEditor;
  /** Whether each mark is active for the current selection. */
  active: Record<Mark, boolean>;
  /** The href the selection sits within, or `null` when not inside a link. */
  link: string | null;
  /**
   * The color token applied uniformly across the selection, or `null` when the
   * selection has no color or mixes several. `"default"` is never reported —
   * it collapses to `null` (no color).
   */
  color: ColorToken | null;
  /**
   * Pin the bar visible regardless of selection. A control that opens a popover
   * (link / color) pins while open so blurring the editor into the popover's
   * input doesn't tear the bar (and the popover) down. Always unpin on close.
   */
  setPinned: (pinned: boolean) => void;
}

const FormatToolbarContext = createContext<FormatToolbarValue | null>(null);

export const FormatToolbarProvider = FormatToolbarContext.Provider;

/**
 * Read the floating-toolbar context. Returns `null` when rendered outside an
 * active toolbar (e.g. during reorder edit mode previews) — callers must guard.
 */
export function useFormatToolbar(): FormatToolbarValue | null {
  return useContext(FormatToolbarContext);
}
