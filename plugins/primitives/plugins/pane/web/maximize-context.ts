import { createContext } from "react";

/**
 * Provided by the layout renderer (e.g. Miller columns) to let PaneChrome
 * hook into layout-level interactions without a hard dependency from the
 * pane primitive back to the layout plugin.
 */
export const PaneLayoutContext = createContext<{
  onDoubleClickHeader: () => void;
  dragHandleProps?: Record<string, unknown>;
  /** This column is at the surface's start (leftmost) edge. */
  atSurfaceStart?: boolean;
  /** This column is at the surface's end (rightmost) edge. */
  atSurfaceEnd?: boolean;
  /**
   * The renderer paints this pane ALONE: its ancestors in the route are not on
   * screen (full-pane). Closing it then reads as going back to the parent, so
   * the chrome draws a leading Back button in place of the trailing ×, and
   * drops the same-app "Expand pane" — there is nothing beside it to detach
   * from.
   */
  ancestorsHidden?: boolean;
} | null>(null);
