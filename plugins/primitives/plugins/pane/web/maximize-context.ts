import { createContext } from "react";

/**
 * Provided by the layout renderer (e.g. Miller columns) to let PaneChrome
 * hook into layout-level interactions without a hard dependency from the
 * pane primitive back to the layout plugin.
 */
export const PaneLayoutContext = createContext<{
  onDoubleClickHeader: () => void;
  dragHandleProps?: Record<string, unknown>;
} | null>(null);
