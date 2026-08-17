import noAdhocViewportOverlay from "./no-adhoc-viewport-overlay";
import noPortalToggle from "./no-portal-toggle";

/**
 * Lint barrel for this plugin's two rules. The root `eslint.config.ts`
 * auto-discovers this default export and registers each repo-wide as `error`.
 *
 * - `no-adhoc-viewport-overlay` — viewport-filling overlays route through
 *   `<ViewportOverlay>` (`@plugins/primitives/plugins/css/plugins/viewport-overlay/web`),
 *   which self-portals to `document.body` so a `fixed inset-0` box fills the
 *   real viewport instead of being clipped by a transformed ancestor's
 *   containing block.
 * - `no-portal-toggle` — a portal put behind a condition remounts its subtree,
 *   so it can never be the keep-alive seam it is usually reached for.
 *
 * `ignores` is intentionally EMPTY (no central allowlist — mirrors surface/card).
 * A genuinely-bespoke site escapes per-site, travelling with the code:
 *
 *   // eslint-disable-next-line viewport-overlay/no-adhoc-viewport-overlay -- <reason>
 */
export default {
  name: "viewport-overlay",
  rules: {
    "no-adhoc-viewport-overlay": noAdhocViewportOverlay,
    "no-portal-toggle": noPortalToggle,
  },
  ignores: {
    "no-adhoc-viewport-overlay": [],
    "no-portal-toggle": [],
  },
};
