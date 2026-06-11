import type { ReactNode } from "react";

/**
 * The pieces the app-rail framing variant lays out. A rail variant owns the
 * outer flex wrapper, sets the `--app-rail-width` CSS var the sidebar reads to
 * offset its left edge, optionally renders the rail, and places `body` (the
 * active app's isolated subtree) beside it.
 *
 * Owned by `apps` (the host) so the contract lives with the consumer, and a
 * rail-framing plugin can contribute a variant without `apps` ever importing a
 * specific one. Mirrors `SidebarFramingProps` in app-shell/core.
 */
export interface RailFramingProps {
  /** The active app's content subtree (already wrapped in PaneBasePathContext). */
  body: ReactNode;
}
