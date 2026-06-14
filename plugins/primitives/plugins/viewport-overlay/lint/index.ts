import noAdhocViewportOverlay from "./no-adhoc-viewport-overlay";

/**
 * Lint barrel for the `no-adhoc-viewport-overlay` rule. The root
 * `eslint.config.ts` auto-discovers this default export and registers
 * `no-adhoc-viewport-overlay` repo-wide as `error`.
 *
 * Viewport-filling overlays route through `<ViewportOverlay>`
 * (`@plugins/primitives/plugins/viewport-overlay/web`), which self-portals to
 * `document.body` so a `fixed inset-0` box fills the real viewport instead of
 * being clipped by a transformed ancestor's containing block.
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
  },
  ignores: {
    "no-adhoc-viewport-overlay": [],
  },
};
