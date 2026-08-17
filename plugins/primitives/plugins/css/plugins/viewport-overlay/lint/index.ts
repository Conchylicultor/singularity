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
 * The `no-adhoc-viewport-overlay` glob below is the single PERMANENT tier — the
 * shadcn dialog/sheet definitions under `ui-kit/web/components/ui/`. They spell
 * `fixed inset-0` as literal strings on base-ui `*.Popup` / `*.Backdrop` tags,
 * which base-ui portals out of the tree, so they DO fill the real viewport and
 * are the implementation those overlays route through; they own the raw recipe
 * and will never migrate. (Same files, same reason, same glob as
 * `no-adhoc-surface`'s permanent tier.) They were previously invisible only
 * because the rule's `HOST_TAGS` gate skipped capitalized tags — a gate that also
 * let `<section className="fixed inset-0">` through, so it is gone.
 *
 * `no-portal-toggle` keeps an EMPTY `ignores` (no central allowlist). Either way,
 * a genuinely-bespoke site escapes per-site, travelling with the code:
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
    "no-adhoc-viewport-overlay": [
      // ── PERMANENT: the shadcn dialog/sheet definitions themselves ──
      // They open-code `fixed inset-0` as literal strings on base-ui
      // `*.Popup`/`*.Backdrop` tags, which base-ui portals to the document root.
      "plugins/primitives/plugins/css/plugins/ui-kit/web/components/ui/**/*.{ts,tsx}",
    ],
    "no-portal-toggle": [],
  },
};
