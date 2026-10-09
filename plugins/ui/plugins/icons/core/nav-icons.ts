import { symbol } from "./icon-ref";

/**
 * The icon a navigating control wears, named by WHERE it sends you — so two
 * controls that open the same kind of destination cannot draw different
 * glyphs, and one glyph never means two destinations.
 *
 * - `newTab` — somewhere else, leaving this view as it is: a new browser or app
 *   tab, an external site, the system browser, a host app. The label says
 *   which. (Arrow out of a box.)
 * - `sidePane` — beside what you are reading, in this surface: a pane pushed to
 *   the right. (A panel opening on the right.)
 * - `expand` — this destination takes over the surface: the pane promoted to
 *   the root, or the thing opened in its home app ("Open in Pages"). (Diagonal
 *   arrows outward.)
 *
 * Fullscreen (`symbol("fullscreen")`) is a different, window-level idea — solo
 * mode, the browser's fullscreen, presenting — and is not a destination.
 *
 * The three glyphs are reserved: `icons/reserved-nav-icon` rejects spelling
 * them with `symbol(…)` anywhere but here.
 */
export const navIcons = {
  newTab: symbol("open-in-new"),
  sidePane: symbol("right-panel-open"),
  expand: symbol("open-in-full"),
} as const;
