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
 * - `docked` — lives in the tab strip; rendered full-area when it is the focused
 *   tab (today's "tabs").
 * - `floating` — a free window with its own geometry (today's "desktop"), drawn
 *   on the shared backdrop.
 * - `solo` — fills the whole viewport and hides the tab bar + rail (the "full
 *   app" fullscreen mode).
 *
 * Owned by `apps` core because placement is per-tab *state* and the tab model is
 * the home of per-tab state; the shell reads it (Esc-to-exit, tab-bar control)
 * and the `surface` plugin reads it to render. All *presentation* lives in the
 * plugin, never here.
 */
export type Placement = "docked" | "floating" | "solo";

/** The default placement for a freshly opened tab. */
export const DEFAULT_PLACEMENT: Placement = "docked";
