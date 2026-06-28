import type { ReactNode } from "react";

/**
 * The pieces the app-rail framing variant lays out. A rail variant owns the
 * outer flex wrapper, sets the `--app-rail-width` CSS var (the rail's own
 * width), optionally renders the rail, and places `body` (the active app's
 * isolated subtree) beside it. `body` starts after the rail purely by virtue of
 * the flex layout, so the app shell's sidebar — fixed but bounded to `body` —
 * pins to `body`'s left edge with no extra offset.
 *
 * Owned by `apps` (the host) so the contract lives with the consumer, and a
 * rail-framing plugin can contribute a variant without `apps` ever importing a
 * specific one. Mirrors `SidebarFramingProps` in app-shell/core.
 */
export interface RailFramingProps {
  /** The active app's content subtree (already wrapped in PaneBasePathContext). */
  body: ReactNode;
}

/**
 * Per-tab spatial placement — the *emergent* arrangement model. There is no
 * global "tabs vs desktop" mode: each open tab carries its own placement and the
 * surface looks like "tabs" when all docked, "desktop" once any float, "full
 * app" when the focused tab is solo. Chrome-style: tearing a tab off a strip
 * just changes its placement.
 *
 * Placement is an **opaque id** owned by the `surface` registry — each placement
 * is a self-contained sub-plugin contributing a descriptor under the
 * `Surface.Placement` slot, and the id is whatever that descriptor declares.
 * `apps` stores the id on the tab and routes it (open/replace/set, the focused
 * snapshot), but never enumerates the valid set and never knows the default:
 * those live in the `surface` registry, surfaced back to `apps` through the
 * apps-owned placement-capability registry. Keeping it a named alias (rather
 * than bare `string`) documents the intent at call sites. All *presentation*
 * lives in the placement sub-plugins, never here.
 */
export type Placement = string;
