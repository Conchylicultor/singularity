import type { ReactNode } from "react";

/**
 * The pieces an app-shell sidebar-bearing layout is decomposed into. A framing
 * variant owns the *entire* sidebar + main wrapper and lays out these pieces.
 *
 * Owned by app-shell (the consumer) so the contract lives with the slot, and a
 * UI framing plugin can contribute a variant without app-shell ever importing
 * `plugins/ui/*`.
 */
export interface SidebarFramingProps {
  /** Brand/header content for the top of the sidebar. */
  header?: ReactNode;
  /** The rendered sidebar nav items. */
  sidebarContent: ReactNode;
  /** The toolbar + main renderer column. */
  body: ReactNode;
}
