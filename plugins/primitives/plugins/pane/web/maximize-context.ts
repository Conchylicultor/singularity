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
} | null>(null);
